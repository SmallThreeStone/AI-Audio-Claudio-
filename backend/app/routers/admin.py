import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_session
from ..models.user import User
from ..models.dj_session import DJSession
from ..models.queue_item import QueueItem
from ..models.listening_history import ListeningHistory
from ..models.song import Song
from ..utils.broadcast import ws_manager

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def verify_admin(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if not user or user.role not in ("admin", "owner"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def verify_owner(request: Request, session: AsyncSession = Depends(get_session)) -> User:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if not user or user.role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user


@router.get("/overview")
async def admin_overview(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
):
    user_count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
    session_count = (await session.execute(select(func.count()).select_from(DJSession))).scalar() or 0
    song_count = (await session.execute(select(func.count()).select_from(Song))).scalar() or 0
    listen_count = (await session.execute(select(func.count()).select_from(ListeningHistory))).scalar() or 0
    active_count = (await session.execute(
        select(func.count()).select_from(User).where(User.login_status == "logged_in")
    )).scalar() or 0

    today = datetime.date.today()
    sessions_today = (await session.execute(
        select(func.count()).select_from(DJSession).where(
            func.date(DJSession.created_at) == today.isoformat()
        )
    )).scalar() or 0

    return {
        "total_users": user_count,
        "total_sessions": session_count,
        "total_songs": song_count,
        "total_listens": listen_count,
        "active_users": active_count,
        "sessions_today": sessions_today,
    }


@router.get("/users")
async def list_users(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()

    # Batch query session and listen counts instead of N+1 per-user queries
    sess_counts = {}
    if users:
        sess_result = await session.execute(
            select(DJSession.user_id, func.count())
            .where(DJSession.user_id.in_([u.id for u in users]))
            .group_by(DJSession.user_id)
        )
        sess_counts = {row[0]: row[1] for row in sess_result.all()}

    listen_counts = {}
    if users:
        listen_result = await session.execute(
            select(ListeningHistory.user_id, func.count())
            .where(ListeningHistory.user_id.in_([u.id for u in users]))
            .group_by(ListeningHistory.user_id)
        )
        listen_counts = {row[0]: row[1] for row in listen_result.all()}

    user_list = []
    for u in users:
        user_list.append({
            "id": u.id,
            "netease_uid": u.netease_uid,
            "nickname": u.nickname,
            "avatar_url": u.avatar_url,
            "login_status": u.login_status,
            "role": u.role,
            "session_count": sess_counts.get(u.id, 0),
            "listen_count": listen_counts.get(u.id, 0),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
        })
    return {"users": user_list}


@router.get("/sessions")
async def admin_sessions(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = 50,
):
    result = await session.execute(
        select(DJSession)
        .order_by(DJSession.created_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    user_ids = {s.user_id for s in sessions if s.user_id}
    user_map = {}
    if user_ids:
        user_result = await session.execute(select(User).where(User.id.in_(user_ids)))
        for u in user_result.scalars():
            user_map[u.id] = u.nickname

    return {
        "sessions": [
            {
                "id": s.id,
                "user_id": s.user_id,
                "user_nickname": user_map.get(s.user_id, "unknown"),
                "user_request": s.user_request,
                "session_theme": s.session_theme,
                "status": s.status,
                "persona": s.persona,
                "total_items": s.total_items,
                "played_items": s.played_items,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/trends")
async def admin_trends(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
    days: int = 7,
):
    end = datetime.date.today()
    start = end - datetime.timedelta(days=days - 1)
    dates = [(start + datetime.timedelta(days=i)).isoformat() for i in range(days)]

    sess_rows = (
        await session.execute(
            select(func.date(DJSession.created_at), func.count())
            .where(func.date(DJSession.created_at) >= start.isoformat())
            .group_by(func.date(DJSession.created_at))
        )
    ).all()

    listen_rows = (
        await session.execute(
            select(func.date(ListeningHistory.listened_at), func.count())
            .where(func.date(ListeningHistory.listened_at) >= start.isoformat())
            .group_by(func.date(ListeningHistory.listened_at))
        )
    ).all()

    sess_map = {row[0]: row[1] for row in sess_rows}
    listen_map = {row[0]: row[1] for row in listen_rows}

    return {
        "trends": [
            {"date": d, "sessions": sess_map.get(d, 0), "listens": listen_map.get(d, 0)}
            for d in dates
        ]
    }


@router.get("/hourly")
async def admin_hourly(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(func.strftime("%H", ListeningHistory.listened_at), func.count())
            .group_by(func.strftime("%H", ListeningHistory.listened_at))
        )
    ).all()

    count_map = {int(row[0]): row[1] for row in rows}
    return {"hourly": [{"hour": h, "count": count_map.get(h, 0)} for h in range(24)]}


@router.get("/listening")
async def admin_listening(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = 20,
):
    result = await session.execute(
        select(ListeningHistory)
        .order_by(ListeningHistory.listened_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()

    user_ids = {e.user_id for e in events if e.user_id}
    song_ids = {e.song_id for e in events if e.song_id}

    user_map = {}
    if user_ids:
        ur = await session.execute(select(User).where(User.id.in_(user_ids)))
        for u in ur.scalars():
            user_map[u.id] = u.nickname

    song_map = {}
    if song_ids:
        sr = await session.execute(select(Song).where(Song.id.in_(song_ids)))
        for s in sr.scalars():
            song_map[s.id] = s.name

    return {
        "events": [
            {
                "id": e.id,
                "user_nickname": user_map.get(e.user_id, "unknown"),
                "song_name": song_map.get(e.song_id, "unknown"),
                "event": e.event,
                "completion_rate": e.completion_rate,
                "listened_at": e.listened_at.isoformat() if e.listened_at else None,
            }
            for e in events
        ]
    }


@router.get("/anomalies")
async def admin_anomalies(
    admin_user: User = Depends(verify_admin),
    session: AsyncSession = Depends(get_session),
):
    alerts: list[dict] = []

    # 1. Today's copyright failure rate
    today = datetime.date.today().isoformat()
    today_qi_total = (
        await session.execute(
            select(func.count())
            .select_from(QueueItem)
            .where(
                QueueItem.item_type == "song",
                func.date(QueueItem.created_at) == today,
            )
        )
    ).scalar() or 0
    today_qi_error = (
        await session.execute(
            select(func.count())
            .select_from(QueueItem)
            .where(
                QueueItem.item_type == "song",
                QueueItem.status == "error",
                func.date(QueueItem.created_at) == today,
            )
        )
    ).scalar() or 0

    if today_qi_total > 0:
        failure_rate = today_qi_error / today_qi_total
        if failure_rate > 0.3:
            alerts.append({
                "level": "warning",
                "title": "版权失效率过高",
                "detail": f"今日 {today_qi_error}/{today_qi_total} 首歌曲 URL 获取失败 ({failure_rate:.0%})",
                "suggestion": "可能网易云 Cookie 已过期，请重新扫码登录",
            })

    # 2. Recent sessions for skip-rate and short-session analysis
    recent_sessions = (
        await session.execute(
            select(DJSession)
            .where(func.date(DJSession.created_at) >= today)
            .order_by(DJSession.created_at.desc())
            .limit(50)
        )
    ).scalars().all()

    if not recent_sessions:
        return {"alerts": alerts, "total": len(alerts)}

    # Batch fetch all listening history stats for recent sessions
    session_ids = [s.id for s in recent_sessions]
    lh_stats_stmt = (
        select(
            ListeningHistory.session_id,
            ListeningHistory.event,
            func.count().label("cnt"),
        )
        .where(
            ListeningHistory.session_id.in_(session_ids),
            ListeningHistory.event.in_(("skipped", "completed")),
        )
        .group_by(ListeningHistory.session_id, ListeningHistory.event)
    )
    lh_rows = (await session.execute(lh_stats_stmt)).all()

    # Build lookup: {session_id: {event: count}}
    lh_lookup: dict[int, dict[str, int]] = {}
    for row in lh_rows:
        lh_lookup.setdefault(row.session_id, {})[row.event] = row.cnt

    # Batch fetch user nicknames
    user_ids = list({s.user_id for s in recent_sessions})
    user_stmt = select(User.id, User.nickname).where(User.id.in_(user_ids))
    user_rows = (await session.execute(user_stmt)).all()
    user_names: dict[int, str] = {row.id: row.nickname or "?" for row in user_rows}

    # 3. Analyze sessions (in-memory, no DB queries)
    for s in recent_sessions:
        stats = lh_lookup.get(s.id, {})
        total_events = stats.get("skipped", 0) + stats.get("completed", 0)
        skip_count = stats.get("skipped", 0)

        if total_events >= 3 and skip_count / total_events > 0.5:
            user_name = user_names.get(s.user_id, "?")
            alerts.append({
                "level": "info",
                "title": "高跳过率会话",
                "detail": f"用户 {user_name} 的会话 #{s.id} 跳过率 {skip_count}/{total_events} ({skip_count/total_events:.0%})——「{s.user_request[:30]}」",
                "suggestion": "建议检查该用户的音乐偏好画像是否需要调整",
            })

        if s.status in ("completed", "error") and s.played_items < 3:
            user_name = user_names.get(s.user_id, "?")
            alerts.append({
                "level": "warning" if s.status == "error" else "info",
                "title": "短会话" if s.played_items > 0 else "空会话",
                "detail": f"用户 {user_name} 的会话 #{s.id} 仅播放 {s.played_items} 首即{'报错' if s.status == 'error' else '停止'}——「{s.user_request[:30]}」",
                "suggestion": "可能是版权歌曲过多或生成失败" if s.status == "error" else "用户可能不满意当前推荐",
            })

    # Sort: warning first, then info
    alerts.sort(key=lambda a: (0 if a["level"] == "warning" else 1))

    return {"alerts": alerts[:20], "total": len(alerts)}


# ── Owner-only endpoints ──

@router.put("/users/{user_id}/role")
async def set_user_role(
    user_id: int,
    body: dict,
    owner: User = Depends(verify_owner),
    session: AsyncSession = Depends(get_session),
):
    """Owner sets a user's role (user/admin/owner)."""
    new_role = body.get("role", "user")
    if new_role not in ("user", "admin", "owner"):
        raise HTTPException(status_code=400, detail="Invalid role")
    result = await session.execute(select(User).where(User.id == user_id))
    target = result.scalar()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.role = new_role
    await session.commit()
    return {"status": "ok", "user_id": user_id, "role": new_role}


@router.post("/sessions/{session_id}/stop")
async def force_stop_session(
    session_id: int,
    owner: User = Depends(verify_owner),
    session: AsyncSession = Depends(get_session),
):
    """Owner force-stops any active session."""
    result = await session.execute(select(DJSession).where(DJSession.id == session_id))
    target = result.scalar()
    if not target:
        raise HTTPException(status_code=404, detail="Session not found")
    if target.status in ("completed",):
        return {"status": "already_stopped"}
    target.status = "completed"
    await session.commit()

    # Broadcast session status to the session owner
    await ws_manager.broadcast_to_user(target.user_id or 0, {
        "type": "session_status",
        "session": {
            "id": target.id,
            "user_request": target.user_request,
            "session_theme": target.session_theme,
            "status": target.status,
            "persona": target.persona or "xiaoyu",
            "total_items": target.total_items,
            "played_items": target.played_items,
            "weather_summary": target.weather_summary,
            "created_at": target.created_at.isoformat() if target.created_at else None,
        },
        "message": "会话已被管理员强制停止",
    })

    return {"status": "ok"}


@router.get("/users/{user_id}/profile")
async def view_user_profile(
    user_id: int,
    owner: User = Depends(verify_owner),
    session: AsyncSession = Depends(get_session),
):
    """Owner views any user's music profile."""
    from ..routers.radio import music_profile as _profile_handler
    # Temporarily override the user lookup to target the specified user
    # We'll re-use the profile logic but with a different user context
    # For simplicity, build the profile manually here

    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    import json
    from sqlalchemy import case, Integer

    total_listens_result = await session.execute(
        select(func.count()).select_from(ListeningHistory).where(ListeningHistory.user_id == user_id)
    )
    total_listens = total_listens_result.scalar() or 0

    # Genre distribution from this user's listening
    genre_result = await session.execute(
        select(Song.genre, func.count())
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .where(ListeningHistory.user_id == user_id, Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count().desc())
        .limit(12)
    )
    genres = [{"name": g[0], "count": g[1]} for g in genre_result.all()]

    # Top artists for this user
    artist_result = await session.execute(
        select(Song.artist, func.count())
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .where(ListeningHistory.user_id == user_id, Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.count().desc())
        .limit(10)
    )
    artists = [{"name": a[0], "count": a[1]} for a in artist_result.all()]

    # Time of day pattern
    hour_result = await session.execute(
        select(
            func.cast(func.strftime("%H", ListeningHistory.listened_at), Integer),
            func.count(),
        )
        .where(ListeningHistory.user_id == user_id, ListeningHistory.event == "started")
        .group_by(func.strftime("%H", ListeningHistory.listened_at))
    )
    time_patterns = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
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

    # Session count
    session_count = (
        await session.execute(select(func.count()).select_from(DJSession).where(DJSession.user_id == user_id))
    ).scalar() or 0

    return {
        "user": {
            "id": user.id,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "login_status": user.login_status,
            "role": user.role,
        },
        "total_listens": total_listens,
        "session_count": session_count,
        "genres": genres,
        "artists": artists,
        "time_patterns": time_patterns,
    }
