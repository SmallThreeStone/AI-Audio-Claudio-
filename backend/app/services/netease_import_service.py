"""
Import NetEase Cloud Music all-time listening history into the local database.

Data source: sidecar /user/record?type=1
Provides volume signal (play counts per song/artist) to complement
the radio's context signal (time/weather/scene correlations).
"""

import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.user import User
from ..models.song import Song
from ..models.netease_listening import NeteaseListening
from .netease_client import netease


async def import_netease_history(db: AsyncSession) -> dict:
    """Import the logged-in user's all-time NetEase listening history.

    Returns: {"imported": N, "skipped": N, "new_songs": N}
    """
    # Get logged-in user
    user_result = await db.execute(
        select(User).where(User.login_status == "logged_in")
    )
    user = user_result.scalar()
    if not user or not user.cookies_json:
        return {"error": "Not logged in to NetEase"}

    try:
        cookies = json.loads(user.cookies_json)
    except (json.JSONDecodeError, TypeError):
        return {"error": "Invalid NetEase cookies"}

    if not user.netease_uid:
        # Try to get account info to find uid
        try:
            account = await netease.user_account(cookies)
            uid = account.get("profile", {}).get("userId") or account.get("account", {}).get("id")
            if uid:
                user.netease_uid = str(uid)
                await db.commit()
        except Exception:
            return {"error": "Cannot determine NetEase user ID"}

    uid = int(user.netease_uid) if user.netease_uid else None
    if not uid:
        return {"error": "No NetEase user ID available"}

    # Fetch all-time listening history
    try:
        data = await netease.user_record(uid, cookies, record_type=0)  # 0=all-time, 1=weekly
    except Exception as e:
        return {"error": f"Failed to fetch NetEase history: {e}"}

    if data.get("code") != 200:
        return {"error": f"NetEase API error: {data.get('message', 'unknown')}"}

    all_data = data.get("allData", [])
    if not all_data:
        return {"imported": 0, "skipped": 0, "new_songs": 0, "message": "No listening history found"}

    imported = 0
    skipped = 0
    new_songs = 0

    # Build index of existing songs by netease_song_id
    existing_songs = await db.execute(select(Song))
    song_index: dict[int, Song] = {}
    for s in existing_songs.scalars():
        if s.netease_song_id:
            song_index[s.netease_song_id] = s

    # Build index of existing netease_listening entries for this user
    existing_stats = await db.execute(
        select(NeteaseListening).where(NeteaseListening.user_id == user.id)
    )
    stats_index: dict[int, NeteaseListening] = {}
    for ns in existing_stats.scalars():
        if ns.song_id:
            stats_index[ns.song_id] = ns

    for entry in all_data:
        play_count = entry.get("playCount", 0)
        score = entry.get("score", 0)
        song_data = entry.get("song", {})
        netease_id = song_data.get("id")

        if not netease_id or play_count == 0:
            skipped += 1
            continue

        # Find or create local song
        local_song = song_index.get(netease_id)
        if not local_song:
            # Create song from NetEase data
            artists = song_data.get("ar", [])
            artist_name = " / ".join(a.get("name", "") for a in artists) if artists else ""
            album_info = song_data.get("al", {})
            album_name = album_info.get("name", "")
            cover_url = album_info.get("picUrl", "")
            duration_ms = song_data.get("dt", 0)

            local_song = Song(
                netease_song_id=netease_id,
                name=song_data.get("name", f"Unknown-{netease_id}"),
                artist=artist_name,
                album=album_name,
                cover_url=cover_url,
                duration_ms=duration_ms,
            )
            db.add(local_song)
            await db.flush()
            song_index[netease_id] = local_song
            new_songs += 1

        # Upsert listening stats
        existing = stats_index.get(local_song.id)
        if existing:
            existing.play_count = play_count
            existing.score = score
            existing.user_id = user.id
            imported += 1
        else:
            db.add(NeteaseListening(
                user_id=user.id,
                song_id=local_song.id,
                netease_song_id=netease_id,
                play_count=play_count,
                score=score,
            ))
            imported += 1

    await db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "new_songs": new_songs,
        "message": f"Imported {imported} songs, {new_songs} new songs added to library",
    }
