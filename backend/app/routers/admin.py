import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_session
from ..models.user import User
from ..models.dj_session import DJSession
from ..models.listening_history import ListeningHistory
from ..models.song import Song

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def verify_admin(session: AsyncSession = Depends(get_session)) -> User:
    result = await session.execute(select(User).where(User.login_status == "logged_in"))
    user = result.scalar()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
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

    user_list = []
    for u in users:
        sess_count = (await session.execute(
            select(func.count()).select_from(DJSession).where(DJSession.user_id == u.id)
        )).scalar() or 0
        listen_count = (await session.execute(
            select(func.count()).select_from(ListeningHistory).where(ListeningHistory.user_id == u.id)
        )).scalar() or 0
        user_list.append({
            "id": u.id,
            "netease_uid": u.netease_uid,
            "nickname": u.nickname,
            "avatar_url": u.avatar_url,
            "login_status": u.login_status,
            "role": u.role,
            "session_count": sess_count,
            "listen_count": listen_count,
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
