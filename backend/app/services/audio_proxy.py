import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.user import User
from ..models.song import Song
from ..services.netease_client import netease


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

    cookies = json.loads(user.cookies_json or "{}")

    # Fetch URL from NetEase (always try, URL cache may have been stale)
    url_data = await netease.song_url(song.netease_song_id, cookies)
    urls = url_data.get("data", [])
    if urls and urls[0].get("url"):
        url = urls[0]["url"]
        song.last_url_fetch = datetime.now(timezone.utc)
        song.has_playable_url = True
        await db.commit()
        return url

    song.has_playable_url = False
    await db.commit()
    return None
