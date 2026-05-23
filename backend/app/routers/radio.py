from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..database import get_session
from ..models.user import User
from ..models.dj_session import DJSession
from ..models.queue_item import QueueItem
from ..models.song import Song
from ..services.dj_engine import generate_radio_script
from ..services.queue_manager import build_queue_from_script, check_refill
from ..routers.ws import ws_manager

router = APIRouter(prefix="/api/radio", tags=["radio"])


class RadioRequest(BaseModel):
    text: str


@router.post("/request")
async def request_radio(body: RadioRequest, session: AsyncSession = Depends(get_session)):
    user_result = await session.execute(select(User).where(User.login_status == "logged_in"))
    user = user_result.scalar()
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")

    # Check song library
    from sqlalchemy import func
    count_result = await session.execute(select(func.count()).select_from(Song))
    total = count_result.scalar() or 0
    if total == 0:
        raise HTTPException(status_code=400, detail="No songs in library. Import playlists first.")

    # Create session
    dj_session = DJSession(
        user_id=user.id,
        user_request=body.text,
        status="generating",
    )
    session.add(dj_session)
    await session.commit()

    # Notify frontend
    await ws_manager.broadcast(_session_status_msg(dj_session))

    async def _progress(stage: str, message: str):
        await ws_manager.broadcast({
            "type": "generation_progress",
            "session_id": dj_session.id,
            "stage": stage,
            "message": message,
        })

    try:
        await _progress("analyzing", "AI 正在感受你的心情...")
        script = await generate_radio_script(session, body.text, dj_session.id)
        dj_session.ai_response_raw = str(script)
        dj_session.session_theme = script.get("session_theme", "")
        await session.commit()

        await _progress("building", "正在准备播放列表...")
        await build_queue_from_script(session, script, dj_session.id, progress_callback=_progress)

        await _broadcast_queue(session, dj_session.id)
    except Exception as e:
        print(f"Radio generation error: {e}")
        dj_session.status = "error"
        await session.commit()
        await ws_manager.broadcast(_session_status_msg(dj_session))
        raise HTTPException(status_code=500, detail=str(e))

    return {"session_id": dj_session.id, "message": "AI DJ is preparing your session..."}


@router.get("/sessions")
async def list_sessions(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(DJSession).order_by(DJSession.created_at.desc()).limit(20)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "user_request": s.user_request,
            "session_theme": s.session_theme,
            "status": s.status,
            "total_items": s.total_items,
            "played_items": s.played_items,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/queue")
async def get_queue(session: AsyncSession = Depends(get_session)):
    # Get latest active session
    result = await session.execute(
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    active = result.scalar()
    if not active:
        return {"type": "queue_update", "session": None, "items": [], "playing_index": 0}

    return await _build_queue_response(session, active)


@router.post("/skip")
async def skip_track(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    active = result.scalar()
    if active:
        active.played_items += 1
        await session.commit()
        await check_refill(session, active.id)
        await _broadcast_queue(session, active.id)

    return {"status": "ok"}


@router.post("/stop")
async def stop_radio(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    active = result.scalar()
    if active:
        active.status = "completed"
        await session.commit()
        await ws_manager.broadcast(_session_status_msg(active))

    return {"status": "ok"}


async def _broadcast_queue(db: AsyncSession, session_id: int):
    result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    s = result.scalar()
    if not s:
        return
    data = await _build_queue_response(db, s)
    await ws_manager.broadcast(data)


def _session_status_msg(s: DJSession) -> dict:
    return {
        "type": "session_status",
        "session": {
            "id": s.id,
            "user_request": s.user_request,
            "session_theme": s.session_theme,
            "status": s.status,
            "total_items": s.total_items,
            "played_items": s.played_items,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
        "message": _status_message(s.status),
    }


def _status_message(status: str) -> str:
    return {
        "pending": "准备中...",
        "generating": "AI DJ 正在为你选歌...",
        "refilling": "AI DJ 正在补充歌曲...",
        "ready": "准备好了",
        "playing": "播放中",
        "completed": "本期电台已结束",
        "error": "出错了",
    }.get(status, status)


async def _build_queue_response(db: AsyncSession, s: DJSession) -> dict:
    items_result = await db.execute(
        select(QueueItem)
        .where(QueueItem.session_id == s.id)
        .order_by(QueueItem.position)
    )
    items = items_result.scalars().all()

    # Enrich with song info
    enriched = []
    for qi in items:
        entry = {
            "id": qi.id,
            "session_id": qi.session_id,
            "position": qi.position,
            "item_type": qi.item_type,
            "song_id": qi.song_id,
            "tts_text": qi.tts_text,
            "tts_audio_url": qi.tts_audio_path,
            "intro_text": qi.intro_text,
            "stream_url": qi.stream_url,
            "status": qi.status,
            "error_message": qi.error_message,
        }

        if qi.song_id:
            song_result = await db.execute(select(Song).where(Song.id == qi.song_id))
            song = song_result.scalar()
            if song:
                entry["song_name"] = song.name
                entry["artist"] = song.artist
                entry["cover_url"] = song.cover_url
                entry["duration_ms"] = song.duration_ms

        enriched.append(entry)

    return {
        "type": "queue_update",
        "session": {
            "id": s.id,
            "user_request": s.user_request,
            "session_theme": s.session_theme,
            "status": s.status,
            "total_items": s.total_items,
            "played_items": s.played_items,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
        "items": enriched,
        "playing_index": s.played_items,
    }
