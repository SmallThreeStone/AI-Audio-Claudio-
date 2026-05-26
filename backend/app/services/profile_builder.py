import json
import datetime
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models.user import User
from ..models.playlist import Playlist
from ..models.song import Song
from ..models.playlist_song import playlist_song_table
from ..services.netease_client import netease

logger = logging.getLogger(__name__)


async def sync_all_playlists(db: AsyncSession, user: User):
    cookies = json.loads(user.cookies_json or "{}")
    if not user.netease_uid or not cookies:
        return {"error": "请先登录网易云账号", "synced": 0, "new_songs": 0}

    # Fetch liked song list
    liked_data = await netease.like_list(user.netease_uid, cookies)

    # Fetch all playlists
    playlist_data = await netease.user_playlist(user.netease_uid, cookies)
    if playlist_data.get("code") and playlist_data["code"] != 200:
        logger.warning(f"user_playlist error for uid={user.netease_uid}: code={playlist_data.get('code')}")
        return {"error": "获取歌单失败，登录可能已过期，请重新登录", "synced": 0, "new_songs": 0}

    playlists = playlist_data.get("playlist", [])
    if not playlists:
        return {"synced": 0, "new_songs": 0}

    synced_count = 0
    total_new_songs = 0

    for pl_data in playlists:
        pl_id = pl_data["id"]
        # Netease marks the liked-songs playlist with specialType=5
        is_liked = pl_data.get("specialType") == 5

        # Upsert playlist (filtered by both netease ID and user_id)
        result = await db.execute(
            select(Playlist).where(
                Playlist.netease_playlist_id == pl_id,
                Playlist.user_id == user.id,
            )
        )
        playlist = result.scalar()
        if not playlist:
            playlist = Playlist(
                netease_playlist_id=pl_id,
                user_id=user.id,
                name=pl_data["name"],
                description=pl_data.get("description", ""),
                cover_url=pl_data.get("coverImgUrl"),
                song_count=pl_data.get("trackCount", 0),
                is_liked=is_liked,
                last_synced=datetime.datetime.utcnow(),
            )
            db.add(playlist)
        else:
            playlist.name = pl_data["name"]
            playlist.song_count = pl_data.get("trackCount", 0)
            playlist.cover_url = pl_data.get("coverImgUrl")
            playlist.last_synced = datetime.datetime.utcnow()

        await db.flush()

        # Fetch all tracks from playlist
        track_data = await netease.playlist_track_all(pl_id, cookies)
        tracks = track_data.get("songs", [])

        new_for_playlist = 0
        for track in tracks:
            song_id = track["id"]

            # Upsert song
            result = await db.execute(
                select(Song).where(Song.netease_song_id == song_id)
            )
            song = result.scalar()
            if not song:
                song = Song(
                    netease_song_id=song_id,
                    name=track["name"],
                    artist=" / ".join(ar["name"] for ar in track.get("ar", [])),
                    album=track.get("al", {}).get("name", ""),
                    duration_ms=track.get("dt", 0),
                    cover_url=track.get("al", {}).get("picUrl"),
                    popularity=track.get("pop", 0),
                )
                db.add(song)
                await db.flush()
                new_for_playlist += 1

            # Link song to playlist
            from sqlalchemy import exists
            stmt = select(exists().where(
                playlist_song_table.c.playlist_id == playlist.id,
                playlist_song_table.c.song_id == song.id,
            ))
            result = await db.execute(stmt)
            if not result.scalar():
                await db.execute(
                    playlist_song_table.insert().values(
                        playlist_id=playlist.id, song_id=song.id
                    )
                )

        synced_count += 1
        total_new_songs += new_for_playlist

    await db.commit()
    return {"synced": synced_count, "new_songs": total_new_songs}


async def enrich_song_moods(db: AsyncSession, user: User, batch_size: int = 50):
    """
    Enrich songs with mood tags using song metadata analysis.
    This is a lightweight heuristic approach; heavy AI classification
    can be added in the DJ engine prompt context.
    """
    result = await db.execute(select(Song).where(Song.mood_tags == None).limit(batch_size))
    songs = result.scalars().all()

    for song in songs:
        tags = _classify_mood(song.name, song.artist or "", song.album or "")
        song.mood_tags = json.dumps(tags, ensure_ascii=False)

    await db.commit()
    return len(songs)


def _classify_mood(name: str, artist: str, album: str) -> list[str]:
    """Simple keyword-based mood classification as fallback."""
    text = f"{name} {artist} {album}"
    tags = []
    mood_keywords = {
        "energetic": ["摇滚", "节奏", "力量", "燃", "炸裂", "punk", "rock", "metal", "electronic", "dance"],
        "calm": ["安静", "钢琴", "轻音乐", "纯音乐", "ambient", "acoustic", "chill", "lofi", "睡眠", "舒缓"],
        "melancholic": ["悲伤", "伤感", "眼泪", "孤独", "失恋", "ballad", "sad", "blues", "emo", "忧郁"],
        "happy": ["快乐", "阳光", "甜蜜", "恋爱", "pop", "funk", "disco", "欢快", "开心", "轻松"],
        "romantic": ["爱情", "浪漫", "情歌", "温柔", "r&b", "soul", "jazz", "慢歌", "抒情", "深情"],
        "nostalgic": ["怀旧", "经典", "老歌", "回忆", "少年", "青春", "童年", "岁月", "往事"],
        "inspirational": ["励志", "梦想", "奋斗", "未来", "向前", "勇气", "希望", "力量"],
        "dreamy": ["梦幻", "电子", "synth", "dream", "迷幻", "氛围", "缥缈", "空灵"],
    }
    for mood, keywords in mood_keywords.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                tags.append(mood)
                break
    return tags if tags else ["other"]
