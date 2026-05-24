import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Integer, case
from pydantic import BaseModel

from ..database import get_session
from ..models.user import User
from ..models.dj_session import DJSession
from ..models.queue_item import QueueItem
from ..models.song import Song
from ..models.listening_history import ListeningHistory
from ..services.dj_engine import generate_radio_script, DJ_PERSONAS
from ..services.queue_manager import build_queue_from_script, check_refill
from ..routers.ws import ws_manager

router = APIRouter(prefix="/api/radio", tags=["radio"])


class RadioRequest(BaseModel):
    text: str
    persona: str = "xiaoyu"


class FeedbackRequest(BaseModel):
    queue_item_id: int
    feedback: str  # 'liked' or 'disliked'


class ListenEventRequest(BaseModel):
    queue_item_id: int
    event: str  # 'started', 'completed', 'skipped'
    position_seconds: float = 0.0


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
        persona=body.persona,
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
        script = await generate_radio_script(session, body.text, dj_session.id, persona=body.persona)
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
            "persona": s.persona or "xiaoyu",
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
            "persona": s.persona or "xiaoyu",
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


@router.post("/feedback")
async def record_feedback(body: FeedbackRequest, session: AsyncSession = Depends(get_session)):
    """Record user feedback (like/dislike) for a queue item and its song."""
    result = await session.execute(select(QueueItem).where(QueueItem.id == body.queue_item_id))
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
async def record_listen_event(body: ListenEventRequest, session: AsyncSession = Depends(get_session)):
    """Record a listening event (started/completed/skipped) for behavioral analysis."""
    # Get queue item and song info
    qi_result = await session.execute(select(QueueItem).where(QueueItem.id == body.queue_item_id))
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

    # Get active user
    user_result = await session.execute(select(User).where(User.login_status == "logged_in"))
    user = user_result.scalar()

    entry = ListeningHistory(
        user_id=user.id if user else None,
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
async def music_profile(session: AsyncSession = Depends(get_session)):
    """Get user's music taste profile with behavioral insights."""
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

    # ===== Behavioral insights =====

    # Total listen events
    total_listens_result = await session.execute(
        select(func.count()).select_from(ListeningHistory)
    )
    total_listens = total_listens_result.scalar() or 0

    # Recently played (last 7 days, with song info)
    recent = []
    if total_listens > 0:
        recent_result = await session.execute(
            select(ListeningHistory, Song.name, Song.artist, Song.cover_url)
            .join(Song, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event == "started")
            .order_by(ListeningHistory.listened_at.desc())
            .limit(20)
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
            select(
                Song.artist,
                func.count().label("total"),
                func.sum(
                    case((ListeningHistory.event == "completed", 1), else_=0)
                ).label("completed"),
            )
            .join(Song, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event.in_(["started", "completed"]))
            .group_by(Song.artist)
            .having(func.count() >= 3)
            .order_by((func.sum(case((ListeningHistory.event == "completed", 1), else_=0)) * 1.0 / func.count()).desc())
            .limit(8)
        )
        for artist, total, comp in comp_result.all():
            rate = round(comp / total * 100) if total > 0 else 0
            completed_artists.append({"name": artist, "completion_rate": rate, "total_plays": total})

    # Most skipped artists
    skipped_artists = []
    if total_listens > 0:
        skip_result = await session.execute(
            select(
                Song.artist,
                func.count().label("total"),
                func.sum(
                    case((ListeningHistory.event == "skipped", 1), else_=0)
                ).label("skipped"),
            )
            .join(Song, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event.in_(["started", "skipped"]))
            .group_by(Song.artist)
            .having(func.count() >= 3)
            .order_by((func.sum(case((ListeningHistory.event == "skipped", 1), else_=0)) * 1.0 / func.count()).desc())
            .limit(8)
        )
        for artist, total, skp in skip_result.all():
            rate = round(skp / total * 100) if total > 0 else 0
            skipped_artists.append({"name": artist, "skip_rate": rate, "total_plays": total})

    # Time-of-day patterns
    time_patterns = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
    if total_listens > 0:
        # Use SQLite strftime to get hour
        hour_result = await session.execute(
            select(
                func.cast(func.strftime("%H", ListeningHistory.listened_at), Integer),
                func.count(),
            )
            .where(ListeningHistory.event == "started")
            .group_by(func.strftime("%H", ListeningHistory.listened_at))
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
            "user_feedback": qi.user_feedback,
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
            "persona": s.persona or "xiaoyu",
            "total_items": s.total_items,
            "played_items": s.played_items,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        },
        "items": enriched,
        "playing_index": s.played_items,
    }
