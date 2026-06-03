import datetime
import json
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists

from ..models.playlist import Playlist
from ..models.playlist_song import playlist_song_table
from ..models.song import Song
from .netease_client import netease
from .profile_builder import _classify_genre, _classify_mood


def _artists(track: dict) -> str:
    artists = track.get("ar") or track.get("artists") or []
    return " / ".join(a.get("name", "") for a in artists if a.get("name"))


def _album(track: dict) -> dict:
    return track.get("al") or track.get("album") or {}


async def upsert_song_from_netease(db: AsyncSession, track: dict) -> Song | None:
    netease_id = track.get("id")
    if not netease_id:
        return None

    result = await db.execute(select(Song).where(Song.netease_song_id == netease_id))
    song = result.scalar()
    artist = _artists(track)
    album = _album(track)
    album_name = album.get("name", "")
    if not song:
        song = Song(
            netease_song_id=netease_id,
            name=track.get("name", f"Unknown-{netease_id}"),
            artist=artist,
            album=album_name,
            duration_ms=track.get("dt") or track.get("duration") or 0,
            cover_url=album.get("picUrl") or album.get("blurPicUrl"),
            popularity=track.get("pop") or track.get("score") or 0,
            genre=_classify_genre(track.get("name", ""), artist, album_name),
        )
        song.mood_tags = json.dumps(_classify_mood(song.name, artist, album_name), ensure_ascii=False)
        db.add(song)
        await db.flush()
    return song


async def search_netease_songs(db: AsyncSession, query: str, limit: int = 12) -> list[Song]:
    data = await netease.cloudsearch(query, limit=limit)
    tracks = data.get("result", {}).get("songs", []) if data else []
    songs: list[Song] = []
    for track in tracks:
        song = await upsert_song_from_netease(db, track)
        if song:
            songs.append(song)
    await db.commit()
    return songs


async def search_and_attach_songs(db: AsyncSession, user_id: int, query: str, limit: int = 12) -> list[Song]:
    songs = await search_netease_songs(db, query, limit)
    if not songs:
        return []
    playlist = await _search_playlist(db, user_id)
    for song in songs:
        exists_stmt = select(exists().where(
            playlist_song_table.c.playlist_id == playlist.id,
            playlist_song_table.c.song_id == song.id,
        ))
        linked = (await db.execute(exists_stmt)).scalar()
        if not linked:
            await db.execute(playlist_song_table.insert().values(playlist_id=playlist.id, song_id=song.id))
    playlist.song_count = await _linked_song_count(db, playlist.id)
    playlist.last_synced = datetime.datetime.utcnow()
    await db.commit()
    return songs


async def _search_playlist(db: AsyncSession, user_id: int) -> Playlist:
    synthetic_id = -900000000 - user_id
    result = await db.execute(
        select(Playlist).where(
            Playlist.user_id == user_id,
            Playlist.netease_playlist_id == synthetic_id,
        )
    )
    playlist = result.scalar()
    if playlist:
        return playlist
    playlist = Playlist(
        netease_playlist_id=synthetic_id,
        user_id=user_id,
        name="网易云搜索素材",
        description="AI 根据点播需求自动搜索补充的候选歌曲",
        cover_url=None,
        song_count=0,
        is_liked=False,
        last_synced=datetime.datetime.utcnow(),
    )
    db.add(playlist)
    await db.flush()
    return playlist


async def _linked_song_count(db: AsyncSession, playlist_id: int) -> int:
    from sqlalchemy import func

    result = await db.execute(
        select(func.count())
        .select_from(playlist_song_table)
        .where(playlist_song_table.c.playlist_id == playlist_id)
    )
    return result.scalar() or 0


def parse_playlist_id(text: str) -> int | None:
    match = re.search(r"(?:playlist\?id=|[?&]id=|/playlist/)(\d+)", text)
    if match:
        return int(match.group(1))
    if text.strip().isdigit():
        return int(text.strip())
    return None


async def import_public_playlist(db: AsyncSession, user_id: int, url_or_id: str) -> dict:
    playlist_id = parse_playlist_id(url_or_id)
    if not playlist_id:
        return {"error": "未识别到网易云歌单 ID", "imported": 0}

    detail = await netease.playlist_detail(playlist_id, {})
    playlist_data = detail.get("playlist", {}) if detail else {}
    if not playlist_data:
        return {"error": "无法读取该公开歌单，请确认链接有效", "imported": 0}

    result = await db.execute(
        select(Playlist).where(
            Playlist.user_id == user_id,
            Playlist.netease_playlist_id == playlist_id,
        )
    )
    playlist = result.scalar()
    if not playlist:
        playlist = Playlist(
            netease_playlist_id=playlist_id,
            user_id=user_id,
            name=playlist_data.get("name", f"公开歌单 {playlist_id}"),
            description=playlist_data.get("description", ""),
            cover_url=playlist_data.get("coverImgUrl"),
            song_count=playlist_data.get("trackCount", 0),
            is_liked=False,
            last_synced=datetime.datetime.utcnow(),
        )
        db.add(playlist)
    else:
        playlist.name = playlist_data.get("name", playlist.name)
        playlist.description = playlist_data.get("description", playlist.description)
        playlist.cover_url = playlist_data.get("coverImgUrl", playlist.cover_url)
        playlist.song_count = playlist_data.get("trackCount", playlist.song_count)
        playlist.last_synced = datetime.datetime.utcnow()
    await db.flush()

    track_data = await netease.playlist_track_all(playlist_id, {})
    tracks = track_data.get("songs", []) if track_data else []
    if not tracks:
        tracks = playlist_data.get("tracks", []) or []
    imported = 0
    for track in tracks:
        song = await upsert_song_from_netease(db, track)
        if not song:
            continue
        exists_stmt = select(exists().where(
            playlist_song_table.c.playlist_id == playlist.id,
            playlist_song_table.c.song_id == song.id,
        ))
        linked = (await db.execute(exists_stmt)).scalar()
        if not linked:
            await db.execute(playlist_song_table.insert().values(playlist_id=playlist.id, song_id=song.id))
            imported += 1

    playlist.song_count = await _linked_song_count(db, playlist.id)
    await db.commit()
    return {
        "playlist_id": playlist.id,
        "name": playlist.name,
        "imported": imported,
        "total": len(tracks),
    }
