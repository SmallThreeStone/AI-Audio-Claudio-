import asyncio
import json
import logging
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import async_session as async_session_factory
from ..models.user import User
from ..models.song import Song
from ..services.netease_client import netease

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(minutes=10)   # Netease streaming URLs expire in ~5-10 min
REFRESH_THRESHOLD = timedelta(minutes=3)  # refresh in background when < 3 min remain


def _utcnow():
    """Return timezone-naive UTC datetime for SQLite compatibility."""
    return datetime.utcnow()


async def _refresh_url_background(song_id: int, user_id: int):
    """Fetch a fresh streaming URL in the background, independent of the request cycle."""
    try:
        # F22: Small delay so the main request's DB write completes first,
        # reducing SQLite lock conflicts on the same row.
        await asyncio.sleep(2)
        async with async_session_factory() as session:
            result = await session.execute(select(Song).where(Song.id == song_id))
            song = result.scalar()
            if not song:
                return

            user_result = await session.execute(select(User).where(User.id == user_id))
            user = user_result.scalar()
            if not user:
                return

            cookies = json.loads(user.cookies_json or "{}")
            url_data = await netease.song_url(song.netease_song_id, cookies)
            urls = url_data.get("data", [])
            if urls and urls[0].get("url") and not urls[0].get("freeTrialInfo"):
                song.cached_stream_url = urls[0]["url"]
                song.last_url_fetch = _utcnow()
                song.has_playable_url = True
                logger.info("Background refresh OK: song_id=%d netease_id=%d", song_id, song.netease_song_id)
            else:
                reason = "trial" if (urls and urls[0].get("freeTrialInfo")) else "no_url"
                song.has_playable_url = False
                song.cached_stream_url = None
                logger.warning("Background refresh FAILED: song_id=%d netease_id=%d reason=%s", song_id, song.netease_song_id, reason)
            await session.commit()
    except Exception:
        logger.warning("Background URL refresh error for song_id=%d", song_id, exc_info=True)


async def get_song_url(db: AsyncSession, song_id: int, user_id: int | None = None) -> str | None:
    """Get a playable streaming URL for a song. Returns None if unavailable."""

    # 1. Load Song
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar()
    if not song:
        logger.warning("[AudioProxy] Song not found: song_id=%d", song_id)
        return None

    # 2. Validate user_id
    if not user_id:
        logger.warning("[AudioProxy] No user_id for song_id=%d", song_id)
        return None

    # 3. Load User
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar()
    if not user:
        logger.warning("[AudioProxy] User not found: user_id=%d song_id=%d", user_id, song_id)
        return None

    now = _utcnow()

    # 4. Cache hit check
    if (
        song.last_url_fetch
        and song.has_playable_url
        and song.cached_stream_url
        and (now - song.last_url_fetch) < CACHE_TTL
    ):
        age = now - song.last_url_fetch
        remaining = CACHE_TTL - age
        logger.info("[AudioProxy] Cache HIT: song_id=%d age=%ds remaining=%ds",
                    song_id, int(age.total_seconds()), int(remaining.total_seconds()))
        if remaining < REFRESH_THRESHOLD:
            logger.info("[AudioProxy] Triggering background refresh for song_id=%d", song_id)
            asyncio.create_task(_refresh_url_background(song_id, user_id))
        return song.cached_stream_url

    # 5. Cache miss — fetch from Netease
    if song.last_url_fetch:
        age = now - song.last_url_fetch
        reason = "expired" if song.has_playable_url else "no_url"
        logger.info("[AudioProxy] Cache MISS: song_id=%d netease_id=%d age=%ds reason=%s",
                    song_id, song.netease_song_id, int(age.total_seconds()), reason)
    else:
        logger.info("[AudioProxy] Cache MISS: song_id=%d netease_id=%d (never fetched)",
                    song_id, song.netease_song_id)

    cookies = json.loads(user.cookies_json or "{}")

    # F23: Retry helper — one retry on sidecar HTTP errors
    async def fetch_with_retry(sid: int, ck: dict, bitrate: int, max_retries: int = 2) -> dict | None:
        for attempt in range(max_retries):
            try:
                return await netease.song_url(sid, ck, br=bitrate)
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning("[AudioProxy] Retry %d/%d for song_id=%d br=%d: %s",
                                   attempt + 1, max_retries, song_id, bitrate, e)
                    await asyncio.sleep(0.5)
                else:
                    logger.error("[AudioProxy] Netease API error after %d retries: song_id=%d br=%d error=%s",
                                 max_retries, song_id, bitrate, e)
        return None

    # F7: Try 320kbps first, fall back to 128kbps if unavailable
    url = None
    for br in (320000, 128000):
        url_data = await fetch_with_retry(song.netease_song_id, cookies, br)
        if not url_data:
            continue

        urls = url_data.get("data", [])
        if urls and urls[0].get("url") and not urls[0].get("freeTrialInfo"):
            url = urls[0]["url"]
            logger.info("[AudioProxy] Netease URL OK: song_id=%d netease_id=%d br=%s (tried br=%d)",
                        song_id, song.netease_song_id, urls[0].get("br"), br)
            break
        elif br == 320000:
            logger.info("[AudioProxy] 320k failed for song_id=%d, retrying 128k", song_id)

    if url:
        # Cache the successful result
        song.cached_stream_url = url
        song.last_url_fetch = _utcnow()
        song.has_playable_url = True
        await db.commit()
        return url

    # Both bitrates failed — but don't mark as permanently unplayable if the
    # user has no Netease cookies. VIP songs always return freeTrial without auth.
    if not cookies:
        logger.warning("[AudioProxy] All bitrates failed (no cookies): song_id=%d netease_id=%d — not marking unplayable",
                       song_id, song.netease_song_id)
        return None

    logger.warning("[AudioProxy] All bitrates failed: song_id=%d netease_id=%d",
                   song_id, song.netease_song_id)
    song.has_playable_url = False
    song.cached_stream_url = None
    song.last_url_fetch = _utcnow()
    await db.commit()
    return None
