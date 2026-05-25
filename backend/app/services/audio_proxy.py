import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import async_session as async_session_factory
from ..models.user import User
from ..models.song import Song
from ..services.netease_client import netease

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(hours=2)
REFRESH_THRESHOLD = timedelta(minutes=10)  # refresh early when TTL drops below this


async def _refresh_url_background(song_id: int):
    """Fetch a fresh streaming URL in the background, independent of the request cycle."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(select(Song).where(Song.id == song_id))
            song = result.scalar()
            if not song:
                return

            user_result = await session.execute(select(User).where(User.login_status == "logged_in"))
            user = user_result.scalar()
            if not user:
                return

            cookies = json.loads(user.cookies_json or "{}")
            url_data = await netease.song_url(song.netease_song_id, cookies)
            urls = url_data.get("data", [])
            if urls and urls[0].get("url"):
                song.cached_stream_url = urls[0]["url"]
                song.last_url_fetch = datetime.now(timezone.utc)
                song.has_playable_url = True
            else:
                song.has_playable_url = False
                song.cached_stream_url = None
            await session.commit()
    except Exception:
        logger.warning("Background URL refresh failed for song %d", song_id, exc_info=True)


async def get_song_url(db: AsyncSession, song_id: int) -> str | None:
    """Get a playable streaming URL for a song. Returns None if unavailable."""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar()
    if not song:
        return None

    # Get user cookies
    user_result = await db.execute(select(User).where(User.login_status == "logged_in"))
    user = user_result.scalar()
    if not user:
        return None

    # Check cache: if fetched < 2h ago with a valid URL, reuse it
    if (
        song.last_url_fetch
        and song.has_playable_url
        and song.cached_stream_url
        and (datetime.now(timezone.utc) - song.last_url_fetch) < CACHE_TTL
    ):
        remaining = CACHE_TTL - (datetime.now(timezone.utc) - song.last_url_fetch)
        if remaining < REFRESH_THRESHOLD:
            asyncio.create_task(_refresh_url_background(song_id))
        return song.cached_stream_url

    cookies = json.loads(user.cookies_json or "{}")

    url_data = await netease.song_url(song.netease_song_id, cookies)
    urls = url_data.get("data", [])
    if urls and urls[0].get("url"):
        url = urls[0]["url"]
        song.cached_stream_url = url
        song.last_url_fetch = datetime.now(timezone.utc)
        song.has_playable_url = True
        await db.commit()
        return url

    song.has_playable_url = False
    song.cached_stream_url = None
    await db.commit()
    return None
