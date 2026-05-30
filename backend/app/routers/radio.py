import json
import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Integer, case
from pydantic import BaseModel

from ..config import DEMO_MODE
from ..database import get_session
from ..models.user import User
from ..models.dj_session import DJSession
from ..models.queue_item import QueueItem
from ..models.song import Song
from ..models.listening_history import ListeningHistory
from ..services.dj_engine import generate_radio_script, DJ_PERSONAS
from ..services.queue_manager import build_queue_from_script, check_refill
from ..services.weather_service import get_weather_summary, get_weather_structured
from ..services.greeting_service import build_greeting
from ..services.calendar_service import get_upcoming_events, build_calendar_summary
from ..utils.broadcast import ws_manager

logger = logging.getLogger(__name__)

import os, json as _json

def _load_demo_songs() -> list[dict]:
    demo_path = os.path.join(os.path.dirname(__file__), "..", "data", "demo_songs.json")
    with open(demo_path, "r", encoding="utf-8") as f:
        return _json.load(f)


def _demo_script_variant(script: dict) -> dict:
    """Convert song items to TTS so the demo plays as a voice-only DJ experience."""
    new_script_items = []
    for entry in script.get("script", []):
        if entry["type"] == "song":
            new_script_items.append({
                "type": "tts",
                "text": entry.get("intro_text", f"接下来推荐一首歌。"),
            })
        else:
            new_script_items.append(entry)
    script = dict(script)
    script["script"] = new_script_items
    return script

router = APIRouter(prefix="/api/radio", tags=["radio"])


def _user_id_from(request: Request) -> int | None:
    return getattr(request.state, "user_id", None)


class RadioRequest(BaseModel):
    text: str
    persona: str = "xiaoyu"
    client_id: str = ""


class ProfileRadioRequest(BaseModel):
    persona: str = "xiaoyu"
    client_id: str = ""


class FeedbackRequest(BaseModel):
    queue_item_id: int
    feedback: str  # 'liked' or 'disliked'


class AdjustRequest(BaseModel):
    session_id: int
    new_mood_text: str
    client_id: str = ""


class ListenEventRequest(BaseModel):
    queue_item_id: int
    event: str  # 'started', 'completed', 'skipped'
    position_seconds: float = 0.0


@router.post("/request")
async def request_radio(body: RadioRequest, req: Request, session: AsyncSession = Depends(get_session)):
    user_id = _user_id_from(req)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar()
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")

    # Stop any currently active session for this user before starting a new one
    active_result = await session.execute(
        select(DJSession)
        .where(DJSession.user_id == user_id, DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    active = active_result.scalar()
    if active:
        active.status = "completed"
        await session.commit()
        await ws_manager.broadcast_to_user(user_id, _session_status_msg(active))

    # Check song library
    from sqlalchemy import func
    count_result = await session.execute(select(func.count()).select_from(Song))
    total = count_result.scalar() or 0
    if total == 0:
        if DEMO_MODE:
            demo_songs = _load_demo_songs()
        else:
            raise HTTPException(status_code=400, detail="No songs in library. Import playlists first.")

    # Fetch weather context
    client_ip = req.client.host if req.client else "127.0.0.1"
    weather_summary = await get_weather_summary(client_ip)

    # Fetch calendar context
    calendar_summary = None
    try:
        events = await get_upcoming_events(session, user_id)
        calendar_summary = build_calendar_summary(events)
    except Exception:
        pass

    # Create session
    dj_session = DJSession(
        user_id=user.id,
        user_request=body.text,
        status="generating",
        persona=body.persona,
        weather_summary=weather_summary,
    )
    session.add(dj_session)
    await session.commit()

    # Notify frontend
    await ws_manager.broadcast_to_user(user_id, _session_status_msg(dj_session))

    async def _progress(stage: str, message: str):
        await ws_manager.broadcast_to_user(user_id, {
            "type": "generation_progress",
            "session_id": dj_session.id,
            "stage": stage,
            "message": message,
        })

    try:
        await _progress("analyzing", "解读心情，构思歌单...")
        script = await generate_radio_script(session, body.text, dj_session.id, persona=body.persona, weather_info=weather_summary, calendar_info=calendar_summary, user_id=user.id, demo_songs=demo_songs if total == 0 else None)
        dj_session.ai_response_raw = str(script)
        dj_session.session_theme = script.get("session_theme", "")
        # Demo mode: convert song items to TTS so the DJ voice demo works without real songs
        if total == 0 and DEMO_MODE:
            script = _demo_script_variant(script)
        await session.commit()

        await _progress("building", "AI 正在为你精选歌曲...")
        await build_queue_from_script(session, script, dj_session.id, progress_callback=_progress)

        await _broadcast_queue(session, dj_session.id, body.client_id)
    except Exception as e:
        logger.error("Radio generation error: %s", e)
        dj_session.status = "error"
        await session.commit()
        await ws_manager.broadcast_to_user(user_id, _session_status_msg(dj_session))
        raise HTTPException(status_code=500, detail=str(e))

    return {"session_id": dj_session.id, "message": "AI DJ is preparing your session..."}


@router.post("/generate-from-profile")
async def generate_from_profile(body: ProfileRadioRequest, req: Request, session: AsyncSession = Depends(get_session)):
    """Generate a radio session based on user's music taste profile (no text input needed)."""
    from ..services.profile_builder import build_profile_prompt

    user_id = _user_id_from(req)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar()
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")

    # Check song library
    count_result = await session.execute(select(func.count()).select_from(Song))
    total = count_result.scalar() or 0
    if total == 0:
        if DEMO_MODE:
            demo_songs = _load_demo_songs()
        else:
            raise HTTPException(status_code=400, detail="No songs in library. Import playlists first.")

    # Build prompt from music profile
    profile_prompt = await build_profile_prompt(session, user_id)

    # Stop any currently active session
    active_result = await session.execute(
        select(DJSession)
        .where(DJSession.user_id == user_id, DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    active = active_result.scalar()
    if active:
        active.status = "completed"
        await session.commit()
        await ws_manager.broadcast_to_user(user_id, _session_status_msg(active))

    # Fetch weather context
    client_ip = req.client.host if req.client else "127.0.0.1"
    weather_summary = await get_weather_summary(client_ip)

    # Fetch calendar context
    calendar_summary = None
    try:
        events = await get_upcoming_events(session, user_id)
        calendar_summary = build_calendar_summary(events)
    except Exception:
        pass

    # Create session
    dj_session = DJSession(
        user_id=user.id,
        user_request=profile_prompt,
        status="generating",
        persona=body.persona,
        weather_summary=weather_summary,
    )
    session.add(dj_session)
    await session.commit()

    await ws_manager.broadcast_to_user(user_id, _session_status_msg(dj_session))

    async def _progress(stage: str, message: str):
        await ws_manager.broadcast_to_user(user_id, {
            "type": "generation_progress",
            "session_id": dj_session.id,
            "stage": stage,
            "message": message,
        })

    try:
        await _progress("analyzing", "解读你的音乐品味，构思专属歌单...")
        script = await generate_radio_script(session, profile_prompt, dj_session.id, persona=body.persona, weather_info=weather_summary, calendar_info=calendar_summary, user_id=user.id, demo_songs=demo_songs if total == 0 else None)
        dj_session.ai_response_raw = str(script)
        dj_session.session_theme = script.get("session_theme", "")
        if total == 0 and DEMO_MODE:
            script = _demo_script_variant(script)
        await session.commit()

        await _progress("building", "AI 正在为你精选歌曲...")
        await build_queue_from_script(session, script, dj_session.id, progress_callback=_progress)

        await _broadcast_queue(session, dj_session.id, body.client_id)
    except Exception as e:
        logger.error("Profile radio generation error: %s", e)
        dj_session.status = "error"
        await session.commit()
        await ws_manager.broadcast_to_user(user_id, _session_status_msg(dj_session))
        raise HTTPException(status_code=500, detail=str(e))

    return {"session_id": dj_session.id, "message": "AI DJ is preparing your personalized session..."}


@router.post("/adjust")
async def adjust_mood(body: AdjustRequest, req: Request, session: AsyncSession = Depends(get_session)):
    """Mid-session mood adjustment: replace upcoming tracks to match a new mood."""
    user_id = _user_id_from(req)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    # Verify session belongs to user
    result = await session.execute(
        select(DJSession).where(
            DJSession.id == body.session_id,
            DJSession.user_id == user_id,
            DJSession.status.in_(["ready", "playing"]),
        )
    )
    dj_session = result.scalar()
    if not dj_session:
        raise HTTPException(status_code=404, detail="Active session not found")

    # Get current position
    current_pos = dj_session.played_items

    # Get recently played song IDs to avoid repeats
    recent = await session.execute(
        select(QueueItem.song_id)
        .where(QueueItem.session_id == body.session_id, QueueItem.item_type == "song", QueueItem.song_id != None)
        .order_by(QueueItem.position.desc())
        .limit(20)
    )
    recent_ids = [r[0] for r in recent.all() if r[0]]

    from ..services.dj_engine import generate_adjustment
    from ..services.queue_manager import replace_upcoming

    try:
        script = await generate_adjustment(
            session,
            dj_session.user_request,
            body.new_mood_text,
            dj_session.session_theme or "",
            recent_ids,
            count=5,
            persona=dj_session.persona or "xiaoyu",
        )
        await replace_upcoming(session, body.session_id, script, current_pos)
        await _broadcast_queue(session, body.session_id, body.client_id)
    except Exception as e:
        logger.error("Adjust mood error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok", "message": "Queue adjusted to new mood"}


@router.get("/sessions")
async def list_sessions(request: Request, session: AsyncSession = Depends(get_session)):
    user_id = _user_id_from(request)
    query = select(DJSession).order_by(DJSession.created_at.desc()).limit(20)
    if user_id is not None:
        query = query.where(DJSession.user_id == user_id)
    result = await session.execute(query)
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "user_request": s.user_request,
            "session_theme": s.session_theme,
            "status": s.status,
            "persona": s.persona or "xiaoyu",
            "total_items": s.total_items,
            "played_items": s.played_items,
            "weather_summary": s.weather_summary,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/queue")
async def get_queue(request: Request, session: AsyncSession = Depends(get_session)):
    user_id = _user_id_from(request)
    query = (
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    if user_id is not None:
        query = query.where(DJSession.user_id == user_id)
    result = await session.execute(query)
    active = result.scalar()
    if not active:
        return {"type": "queue_update", "session": None, "items": [], "playing_index": 0}

    # Auto-expire sessions from previous days
    if active.created_at and active.created_at.date() < datetime.date.today():
        active.status = "completed"
        await session.commit()
        return {"type": "queue_update", "session": None, "items": [], "playing_index": 0}

    return await _build_queue_response(session, active)


@router.post("/skip")
async def skip_track(request: Request, session: AsyncSession = Depends(get_session)):
    user_id = _user_id_from(request)
    query = (
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    if user_id is not None:
        query = query.where(DJSession.user_id == user_id)
    result = await session.execute(query)
    active = result.scalar()
    if active:
        active.played_items += 1
        await session.commit()
        await check_refill(session, active.id)
        await _broadcast_queue(session, active.id)

    return {"status": "ok"}


@router.post("/skip-to/{queue_item_id}")
async def skip_to_track(queue_item_id: int, request: Request, session: AsyncSession = Depends(get_session)):
    # Find the target queue item
    qi_result = await session.execute(
        select(QueueItem).where(QueueItem.id == queue_item_id)
    )
    qi = qi_result.scalar()
    if not qi:
        return {"status": "not_found"}

    # Find the active session (must belong to current user)
    user_id = _user_id_from(request)
    active_query = (
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    if user_id is not None:
        active_query = active_query.where(DJSession.user_id == user_id)
    active_result = await session.execute(active_query)
    active = active_result.scalar()
    if active:
        active.played_items = qi.position
        await session.commit()
        await _broadcast_queue(session, active.id)

    return {"status": "ok"}


@router.post("/stop")
async def stop_radio(request: Request, session: AsyncSession = Depends(get_session)):
    user_id = _user_id_from(request)
    query = (
        select(DJSession)
        .where(DJSession.status.in_(["ready", "playing", "generating", "refilling"]))
        .order_by(DJSession.created_at.desc())
        .limit(1)
    )
    if user_id is not None:
        query = query.where(DJSession.user_id == user_id)
    result = await session.execute(query)
    active = result.scalar()
    if active:
        active.status = "completed"
        await session.commit()
        await ws_manager.broadcast_to_user(user_id, _session_status_msg(active))

    return {"status": "ok"}


async def _broadcast_queue(db: AsyncSession, session_id: int, initiator_client_id: str = ""):
    result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    s = result.scalar()
    if not s:
        return
    data = await _build_queue_response(db, s, initiator_client_id)
    # Only broadcast to the session owner, not all connected clients
    user_id = s.user_id if s.user_id else 0
    await ws_manager.broadcast_to_user(user_id, data)


def _session_status_msg(s: DJSession) -> dict:
    return {
        "type": "session_status",
        "session": {
            "id": s.id,
            "user_request": s.user_request,
            "session_theme": s.session_theme,
            "status": s.status,
            "persona": s.persona or "xiaoyu",
            "total_items": s.total_items,
            "played_items": s.played_items,
            "weather_summary": s.weather_summary,
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


@router.get("/personas")
async def list_personas():
    """List available DJ personas."""
    return [
        {
            "id": pid,
            "name": p["name"],
            "emoji": p["emoji"],
            "tagline": p["tagline"],
            "voice": p["voice"],
            "style": p["style"],
        }
        for pid, p in DJ_PERSONAS.items()
    ]


@router.get("/weather")
async def get_weather_info(request: Request):
    """Get structured weather + location data for header widget."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    data = await get_weather_structured(client_ip)
    if not data:
        return {"available": False}
    return {"available": True, **data}


@router.get("/greeting")
async def get_greeting(request: Request, session: AsyncSession = Depends(get_session)):
    """Get a context-aware greeting based on time, weather, and listening history."""
    user_id = _user_id_from(request)
    client_ip = request.client.host if request.client else "127.0.0.1"
    weather_summary = None
    try:
        weather_summary = await get_weather_summary(client_ip)
    except Exception:
        pass
    return await build_greeting(session, weather_summary, user_id)


@router.get("/demo-status")
async def demo_status(session: AsyncSession = Depends(get_session)):
    from sqlalchemy import func
    count_result = await session.execute(select(func.count()).select_from(Song))
    total = count_result.scalar() or 0
    return {
        "demo_available": total == 0 and DEMO_MODE,
        "song_count": total,
        "message": "No songs yet. Experience a demo to see what Claudio FM can do." if total == 0 and DEMO_MODE else None,
    }


@router.post("/feedback")
async def record_feedback(body: FeedbackRequest, request: Request, session: AsyncSession = Depends(get_session)):
    """Record user feedback (like/dislike) for a queue item and its song."""
    # Verify QueueItem belongs to current user's session
    user_id = _user_id_from(request)
    qi_query = select(QueueItem).where(QueueItem.id == body.queue_item_id)
    if user_id is not None:
        qi_query = qi_query.join(DJSession, QueueItem.session_id == DJSession.id).where(DJSession.user_id == user_id)
    result = await session.execute(qi_query)
    qi = result.scalar()
    if not qi:
        raise HTTPException(status_code=404, detail="Queue item not found")

    qi.user_feedback = body.feedback

    # Also update song aggregate counts
    if qi.song_id:
        song_result = await session.execute(select(Song).where(Song.id == qi.song_id))
        song = song_result.scalar()
        if song:
            if body.feedback == "liked":
                song.like_count = (song.like_count or 0) + 1
            elif body.feedback == "disliked":
                song.dislike_count = (song.dislike_count or 0) + 1

    await session.commit()
    return {"status": "ok"}


@router.post("/listen-event")
async def record_listen_event(body: ListenEventRequest, request: Request, session: AsyncSession = Depends(get_session)):
    """Record a listening event (started/completed/skipped) for behavioral analysis."""
    user_id = _user_id_from(request)

    # Get queue item, verifying it belongs to current user's session
    qi_query = select(QueueItem).where(QueueItem.id == body.queue_item_id)
    if user_id is not None:
        qi_query = qi_query.join(DJSession, QueueItem.session_id == DJSession.id).where(DJSession.user_id == user_id)
    qi_result = await session.execute(qi_query)
    qi = qi_result.scalar()
    if not qi or not qi.song_id:
        return {"status": "ok"}  # TTS items not tracked

    # Get song duration
    song_result = await session.execute(select(Song).where(Song.id == qi.song_id))
    song = song_result.scalar()
    duration_ms = song.duration_ms if song else 0

    # Calculate completion rate
    completion_rate = None
    if body.event in ("completed", "skipped") and duration_ms > 0:
        duration_sec = duration_ms / 1000.0
        completion_rate = min(body.position_seconds / duration_sec, 1.0) if body.position_seconds > 0 else 0.0

    entry = ListeningHistory(
        user_id=user_id,
        song_id=qi.song_id,
        queue_item_id=body.queue_item_id,
        session_id=qi.session_id,
        event=body.event,
        position_seconds=body.position_seconds if body.event != "started" else 0.0,
        duration_ms=duration_ms,
        completion_rate=completion_rate,
    )
    session.add(entry)

    # Implicit feedback: high skip rate on a song → auto-dislike
    # Skipped before 50% = implicit dislike
    if body.event == "skipped" and completion_rate is not None and completion_rate < 0.5 and song:
        song.dislike_count = (song.dislike_count or 0) + 1
    # Completed >90% = implicit like
    elif body.event == "completed" and completion_rate is not None and completion_rate > 0.9 and song:
        song.like_count = (song.like_count or 0) + 1

    await session.commit()
    return {"status": "ok"}


@router.get("/profile")
async def music_profile(request: Request, session: AsyncSession = Depends(get_session)):
    """Get user's music taste profile with behavioral insights."""
    user_id = _user_id_from(request)

    # Genre distribution
    genre_result = await session.execute(
        select(Song.genre, func.count())
        .where(Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count().desc())
        .limit(12)
    )
    genres = [{"name": g[0], "count": g[1]} for g in genre_result.all()]

    # Mood distribution (from mood_tags JSON)
    songs_with_moods = await session.execute(
        select(Song.mood_tags).where(Song.mood_tags != None)
    )
    mood_count = {}
    for (tags,) in songs_with_moods.all():
        try:
            tag_list = json.loads(tags) if isinstance(tags, str) else tags
            for t in tag_list:
                mood_count[t] = mood_count.get(t, 0) + 1
        except (json.JSONDecodeError, TypeError):
            pass
    moods = sorted(
        [{"name": k, "count": v} for k, v in mood_count.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # BPM distribution
    bpm_result = await session.execute(
        select(Song.bpm, func.count())
        .where(Song.bpm != None)
        .group_by(Song.bpm)
    )
    bpm_data = [(b[0] or 0, b[1]) for b in bpm_result.all()]
    bpm_buckets = {"慢 (<80)": 0, "中慢 (80-100)": 0, "中速 (100-120)": 0, "中快 (120-140)": 0, "快 (>140)": 0}
    for bpm, cnt in bpm_data:
        if bpm < 80:
            bpm_buckets["慢 (<80)"] += cnt
        elif bpm < 100:
            bpm_buckets["中慢 (80-100)"] += cnt
        elif bpm < 120:
            bpm_buckets["中速 (100-120)"] += cnt
        elif bpm < 140:
            bpm_buckets["中快 (120-140)"] += cnt
        else:
            bpm_buckets["快 (>140)"] += cnt

    # Top artists (library)
    artist_result = await session.execute(
        select(Song.artist, func.count())
        .where(Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.count().desc())
        .limit(10)
    )
    artists = [{"name": a[0], "count": a[1]} for a in artist_result.all()]

    # Totals
    total_result = await session.execute(select(func.count()).select_from(Song))
    total_songs = total_result.scalar() or 0

    liked_result = await session.execute(select(func.sum(Song.like_count)).select_from(Song))
    total_likes = liked_result.scalar() or 0

    # ===== Behavioral insights (per-user) =====
    from ..utils.user_filter import apply_user_filter
    _user_filter = lambda q: apply_user_filter(q, user_id, ListeningHistory)

    # Total listen events
    total_listens_result = await session.execute(
        _user_filter(select(func.count()).select_from(ListeningHistory))
    )
    total_listens = total_listens_result.scalar() or 0

    # Recently played (last 7 days, with song info)
    recent = []
    if total_listens > 0:
        recent_result = await session.execute(
            _user_filter(
                select(ListeningHistory, Song.name, Song.artist, Song.cover_url)
                .join(ListeningHistory, ListeningHistory.song_id == Song.id)
                .where(ListeningHistory.event == "started")
                .order_by(ListeningHistory.listened_at.desc())
                .limit(20)
            )
        )
        seen = set()
        for lh, name, artist, cover in recent_result.all():
            key = lh.song_id
            if key in seen:
                continue
            seen.add(key)
            recent.append({
                "song_id": lh.song_id,
                "name": name,
                "artist": artist,
                "cover_url": cover,
                "listened_at": lh.listened_at.isoformat() if lh.listened_at else None,
            })

    # Most completed artists (high completion rate, min 3 plays)
    completed_artists = []
    if total_listens > 0:
        comp_result = await session.execute(
            _user_filter(
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
                .limit(8)
            )
        )
        for artist, total, comp in comp_result.all():
            rate = round(comp / total * 100) if total > 0 else 0
            completed_artists.append({"name": artist, "completion_rate": rate, "total_plays": total})

    # Most skipped artists
    skipped_artists = []
    if total_listens > 0:
        skip_result = await session.execute(
            _user_filter(
                select(
                    Song.artist,
                    func.count().label("total"),
                    func.sum(
                        case((ListeningHistory.event == "skipped", 1), else_=0)
                    ).label("skipped"),
                )
                .join(ListeningHistory, ListeningHistory.song_id == Song.id)
                .where(ListeningHistory.event.in_(["started", "skipped"]))
                .group_by(Song.artist)
                .having(func.count() >= 3)
                .order_by((func.sum(case((ListeningHistory.event == "skipped", 1), else_=0)) * 1.0 / func.count()).desc())
                .limit(8)
            )
        )
        for artist, total, skp in skip_result.all():
            rate = round(skp / total * 100) if total > 0 else 0
            skipped_artists.append({"name": artist, "skip_rate": rate, "total_plays": total})

    # Time-of-day patterns
    time_patterns = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
    if total_listens > 0:
        # Use SQLite strftime to get hour
        hour_result = await session.execute(
            _user_filter(
                select(
                    func.cast(func.strftime("%H", ListeningHistory.listened_at), Integer),
                    func.count(),
                )
                .where(ListeningHistory.event == "started")
                .group_by(func.strftime("%H", ListeningHistory.listened_at))
            )
        )
        for hour, cnt in hour_result.all():
            if hour is None:
                continue
            if 6 <= hour < 12:
                time_patterns["morning"] += cnt
            elif 12 <= hour < 18:
                time_patterns["afternoon"] += cnt
            elif 18 <= hour < 23:
                time_patterns["evening"] += cnt
            else:
                time_patterns["night"] += cnt

    return {
        "total_songs": total_songs,
        "total_likes": total_likes,
        "total_listens": total_listens,
        "genres": genres,
        "moods": moods,
        "bpm_buckets": [{"name": k, "count": v} for k, v in bpm_buckets.items()],
        "top_artists": artists,
        "recently_played": recent[:10],
        "completed_artists": completed_artists,
        "skipped_artists": skipped_artists,
        "time_patterns": time_patterns,
    }


@router.get("/distillation")
async def get_distillation(request: Request, session: AsyncSession = Depends(get_session)):
    """Get AI-distilled music taste insights with cross-dimension correlations."""
    from ..services.distillation_service import distill
    import dataclasses

    user_id = _user_id_from(request)

    result = await distill(session, user_id)
    return {
        "meta": result.meta,
        "persona_paragraph": result.persona_paragraph,
        "netease_affinity": dataclasses.asdict(result.netease_affinity) if result.netease_affinity else None,
        "time_affinity": [dataclasses.asdict(e) for e in result.time_affinity],
        "weather_affinity": [dataclasses.asdict(e) for e in result.weather_affinity],
        "scene_affinity": [dataclasses.asdict(e) for e in result.scene_affinity],
        "cross_insights": [dataclasses.asdict(e) for e in result.cross_insights],
    }


@router.post("/import-netease-history")
async def import_netease_history(request: Request, session: AsyncSession = Depends(get_session)):
    """Import the user's all-time NetEase Cloud Music listening history."""
    from ..services.netease_import_service import import_netease_history
    user_id = _user_id_from(request)
    result = await import_netease_history(session, user_id)
    return result


async def _build_queue_response(db: AsyncSession, s: DJSession, initiator_client_id: str = "") -> dict:
    items_result = await db.execute(
        select(QueueItem)
        .where(QueueItem.session_id == s.id)
        .order_by(QueueItem.position)
    )
    items = items_result.scalars().all()

    # Batch-fetch all Song info to avoid N+1 queries
    song_ids = [qi.song_id for qi in items if qi.song_id]
    song_map: dict[int, Song] = {}
    if song_ids:
        song_result = await db.execute(select(Song).where(Song.id.in_(song_ids)))
        for s in song_result.scalars():
            song_map[s.id] = s

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
            "user_feedback": qi.user_feedback,
        }

        if qi.song_id:
            song = song_map.get(qi.song_id)
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
            "persona": s.persona or "xiaoyu",
            "total_items": s.total_items,
            "played_items": s.played_items,
            "weather_summary": s.weather_summary,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
        "items": enriched,
        "playing_index": s.played_items,
        "initiator_client_id": initiator_client_id,
    }
