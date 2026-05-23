from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_session
from ..models.song import Song

router = APIRouter(prefix="/api/songs", tags=["songs"])


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
            {
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
            for s in songs
        ],
        "total": total,
        "page": page,
    }
