from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_session
from ..models.song import Song
from ..services.public_library_service import search_and_attach_songs, search_netease_songs, import_public_playlist

router = APIRouter(prefix="/api/songs", tags=["songs"])


def _song_payload(s: Song) -> dict:
    return {
        "id": s.id,
        "netease_song_id": s.netease_song_id,
        "name": s.name,
        "artist": s.artist,
        "album": s.album,
        "duration_ms": s.duration_ms,
        "cover_url": s.cover_url,
        "genre": s.genre,
        "mood_tags": s.mood_tags,
        "bpm": s.bpm,
        "popularity": s.popularity,
    }


@router.get("")
async def list_songs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query(""),
    genre: str = Query(""),
    mood: str = Query(""),
    session: AsyncSession = Depends(get_session),
):
    query = select(Song)

    if search:
        query = query.where(
            (Song.name.contains(search)) | (Song.artist.contains(search))
        )
    if genre:
        query = query.where(Song.genre == genre)
    if mood:
        query = query.where(Song.mood_tags.contains(mood))

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_query)).scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    result = await session.execute(query.offset(offset).limit(limit))
    songs = result.scalars().all()

    return {
        "songs": [
            _song_payload(s)
            for s in songs
        ],
        "total": total,
        "page": page,
    }


@router.get("/netease-search")
async def netease_search(
    request: Request,
    q: str = Query("", min_length=1),
    limit: int = Query(12, ge=1, le=30),
    session: AsyncSession = Depends(get_session),
):
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        songs = await search_and_attach_songs(session, user_id, q, limit)
    else:
        songs = await search_netease_songs(session, q, limit)
    return {"songs": [_song_payload(s) for s in songs], "attached": bool(user_id)}


@router.post("/import-public-playlist")
async def import_playlist(
    body: dict,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return {"error": "Missing client identity", "imported": 0}
    url = (body.get("url") or body.get("playlist_url") or "").strip()
    return await import_public_playlist(session, user_id, url)
