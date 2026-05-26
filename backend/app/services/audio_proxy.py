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

    try:
        url_data = await netease.song_url(song.netease_song_id, cookies)
    except Exception as e:
        logger.error("[AudioProxy] Netease API error: song_id=%d netease_id=%d error=%s",
                     song_id, song.netease_song_id, e, exc_info=True)
        return None

    urls = url_data.get("data", [])
    if not urls:
        logger.warning("[AudioProxy] Netease returned empty data: song_id=%d netease_id=%d",
                       song_id, song.netease_song_id)
        song.has_playable_url = False
        song.cached_stream_url = None
        await db.commit()
        return None

    url_info = urls[0]
    url = url_info.get("url")
    free_trial = url_info.get("freeTrialInfo")

    if free_trial:
        logger.warning("[AudioProxy] Netease returned PREVIEW CLIP (freeTrialInfo present): "
                       "song_id=%d netease_id=%d br=%s level=%s",
                       song_id, song.netease_song_id,
                       url_info.get("br"), url_info.get("level"))
        song.has_playable_url = False
        song.cached_stream_url = None
        await db.commit()
        return None

    if url:
        logger.info("[AudioProxy] Netease URL OK: song_id=%d netease_id=%d br=%s",
                    song_id, song.netease_song_id, url_info.get("br"))
        song.cached_stream_url = url
        song.last_url_fetch = _utcnow()
        song.has_playable_url = True
        await db.commit()
        return url

    logger.warning("[AudioProxy] Netease returned no URL: song_id=%d netease_id=%d br=%s level=%s",
                   song_id, song.netease_song_id, url_info.get("br"), url_info.get("level"))
    song.has_playable_url = False
    song.cached_stream_url = None
    await db.commit()
    return None
