import json
import datetime
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, case

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
                    genre=_classify_genre(track["name"], " / ".join(ar["name"] for ar in track.get("ar", [])), track.get("al", {}).get("name", "")),
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
        if not song.genre:
            song.genre = _classify_genre(song.name, song.artist or "", song.album or "")

    await db.commit()

    # Also backfill genre for songs that already have mood_tags but no genre
    result2 = await db.execute(select(Song).where(Song.mood_tags != None, Song.genre == None).limit(batch_size))
    genre_songs = result2.scalars().all()
    for song in genre_songs:
        song.genre = _classify_genre(song.name, song.artist or "", song.album or "")
    if genre_songs:
        await db.commit()

    return len(songs) + len(genre_songs)


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


async def build_profile_prompt(db: AsyncSession, user_id: int) -> str:
    """Build a natural-language prompt from the user's music profile for one-click radio generation."""
    from sqlalchemy import func

    # Top artists
    artist_result = await db.execute(
        select(Song.artist, func.count())
        .where(Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_artists = [a[0] for a in artist_result.all() if a[0]]

    # Top genres (from songs)
    genre_result = await db.execute(
        select(Song.genre, func.count())
        .where(Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_genres = [g[0] for g in genre_result.all() if g[0]]

    # Top moods
    mood_result = await db.execute(
        select(Song.mood_tags).where(Song.mood_tags != None)
    )
    mood_count: dict[str, int] = {}
    for (tags,) in mood_result.all():
        try:
            tag_list = json.loads(tags) if isinstance(tags, str) else tags
            for t in tag_list:
                mood_count[t] = mood_count.get(t, 0) + 1
        except (json.JSONDecodeError, TypeError):
            pass
    top_moods = sorted(mood_count.items(), key=lambda x: x[1], reverse=True)[:5]

    # Listening history - completed artists (artists user listens through)
    from ..models.listening_history import ListeningHistory
    from ..utils.user_filter import apply_user_filter

    completed_query = apply_user_filter(
        select(
            Song.artist,
            func.count().label("total"),
            func.sum(
                case((ListeningHistory.event == "completed", 1), else_=0)
            ).label("completed"),
        )
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .where(ListeningHistory.event.in_(["started", "completed"]))
        .group_by(Song.artist)
        .having(func.count() >= 3)
        .order_by((func.sum(case((ListeningHistory.event == "completed", 1), else_=0)) * 1.0 / func.count()).desc())
        .limit(3),
        user_id, ListeningHistory,
    )
    comp_result = await db.execute(completed_query)
    loved_artists = [row[0] for row in comp_result.all() if row[0]]

    parts = ["基于我的音乐品味生成一个专属电台"]

    if top_artists:
        parts.append(f"我最常听的艺人是{'、'.join(top_artists[:4])}")
    if top_genres:
        parts.append(f"偏好{'、'.join(top_genres[:3])}风格")
    if top_moods:
        mood_names = [m[0] for m in top_moods[:3]]
        parts.append(f"喜欢{'、'.join(mood_names)}的音乐")
    if loved_artists:
        parts.append(f"最爱听完{'、'.join(loved_artists)}的歌")

    return "，".join(parts) + "。"


def _classify_genre(name: str, artist: str, album: str) -> str | None:
    """Simple keyword-based genre classification. Returns None when no match."""
    text = f"{name} {artist} {album}"
    genre_keywords = {
        "rock": ["摇滚", "rock", "金属", "metal", "punk", "朋克", "重型", "硬核"],
        "pop": ["流行", "pop", "偶像", "idol", "热歌", "抖音", "网红"],
        "electronic": ["电子", "electro", "dance", "舞曲", "edm", "house", "techno", "trance", "dubstep", "电音", "dj"],
        "folk": ["民谣", "folk", "吉他弹唱", "独立", "indie", "文艺"],
        "classical": ["古典", "classical", "交响", "symphony", "orchestra", "钢琴曲", "小提琴", "管弦"],
        "jazz": ["爵士", "jazz", "布鲁斯", "blues", "swing", "bossa", "lounge"],
        "hiphop": ["嘻哈", "说唱", "rap", "hip-hop", "hiphop", "trap", "freestyle"],
        "rnb": ["r&b", "rnb", "节奏布鲁斯", "soul", "灵魂乐", "放克", "funk"],
        "chinese": ["古风", "国风", "民乐", "戏曲", "京剧", "二胡", "琵琶", "古筝", "中国风"],
        "easy_listening": ["轻音乐", "纯音乐", "ambient", "冥想", "瑜伽", "治愈", "放松", "睡眠", "lofi"],
        "soundtrack": ["原声", "影视", "ost", "主题曲", "配乐", "游戏音乐", "动漫", "anime"],
        "world": ["世界音乐", "拉丁", "latin", "雷鬼", "reggae", "民族", "民歌"],
    }
    for genre_name, keywords in genre_keywords.items():
        for kw in keywords:
            if kw.lower() in text.lower():
                return genre_name
    return None
