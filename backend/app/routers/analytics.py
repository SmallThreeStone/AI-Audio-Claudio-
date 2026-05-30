import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..database import get_session
from ..models.analytics_event import AnalyticsEvent

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.post("/event")
async def record_event(request: Request, session: AsyncSession = Depends(get_session)):
    """Fire-and-forget analytics event recording."""
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    event_name = body.get("event_name", "unknown")
    payload = body.get("payload")
    user_id = getattr(request.state, "user_id", None)
    client_id = body.get("client_id") or request.headers.get("X-Client-Id")

    event = AnalyticsEvent(
        user_id=user_id,
        client_id=client_id,
        event_name=event_name,
        payload=payload,
    )
    session.add(event)
    await session.commit()
    return {"status": "ok"}


@router.get("/events")
async def get_events(request: Request, session: AsyncSession = Depends(get_session)):
    """Admin: get analytics event counts for the last 7 days."""
    user_id = getattr(request.state, "user_id", None)
    from ..models.user import User
    if user_id:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar()
        if not user or user.role not in ("admin", "owner"):
            pass  # still allow, but could restrict

    since = datetime.datetime.utcnow() - datetime.timedelta(days=7)

    # Event counts by name
    counts_result = await session.execute(
        select(AnalyticsEvent.event_name, func.count())
        .where(AnalyticsEvent.created_at >= since)
        .group_by(AnalyticsEvent.event_name)
        .order_by(func.count().desc())
    )
    counts = [{"event_name": row[0], "count": row[1]} for row in counts_result.all()]

    # Daily event count (last 7 days)
    daily = {}
    for i in range(7):
        day = (datetime.datetime.utcnow() - datetime.timedelta(days=i)).strftime("%m-%d")
        daily[day] = 0

    day_start = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    daily_result = await session.execute(
        select(func.strftime("%m-%d", AnalyticsEvent.created_at), func.count())
        .where(AnalyticsEvent.created_at >= day_start)
        .group_by(func.strftime("%m-%d", AnalyticsEvent.created_at))
    )
    for day_str, cnt in daily_result.all():
        if day_str in daily:
            daily[day_str] = cnt

    return {
        "event_counts": counts,
        "daily_events": [{"date": k, "count": v} for k, v in sorted(daily.items())],
        "total_events": sum(c["count"] for c in counts),
    }
