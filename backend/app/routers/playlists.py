from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_session
from ..models.user import User
from ..models.playlist import Playlist
from ..services.profile_builder import sync_all_playlists, enrich_song_moods

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


@router.get("")
async def list_playlists(session: AsyncSession = Depends(get_session)):
    user_result = await session.execute(select(User).where(User.login_status == "logged_in"))
    user = user_result.scalar()
    query = select(Playlist).order_by(Playlist.is_liked.desc(), Playlist.song_count.desc())
    if user:
        query = query.where(Playlist.user_id == user.id)
    result = await session.execute(query)
    playlists = result.scalars().all()
    return [
        {
            "id": pl.id,
            "netease_playlist_id": pl.netease_playlist_id,
            "name": pl.name,
            "description": pl.description,
            "cover_url": pl.cover_url,
            "song_count": pl.song_count,
            "is_liked": pl.is_liked,
            "last_synced": pl.last_synced.isoformat() if pl.last_synced else None,
        }
        for pl in playlists
    ]


@router.post("/sync")
async def sync_playlists(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.login_status == "logged_in"))
    user = result.scalar()
    if not user:
        return {"error": "Not logged in"}

    sync_result = await sync_all_playlists(session, user)

    # Enrich moods for new songs
    enriched = await enrich_song_moods(session, user)

    return {**sync_result, "enriched": enriched}
