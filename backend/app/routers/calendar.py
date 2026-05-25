from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..services.calendar_service import (
    get_auth_url, handle_callback, get_upcoming_events,
)
from ..config import CALENDAR_ENABLED

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/status")
async def calendar_status(session: AsyncSession = Depends(get_session)):
    """Get Google Calendar connection status."""
    connected = await _is_connected(session)
    last_sync = None
    if connected:
        from sqlalchemy import select
        from ..models.user import User
        result = await session.execute(select(User).where(User.login_status == "logged_in"))
        user = result.scalar()
        if user and user.google_token_json:
            import json
            try:
                token = json.loads(user.google_token_json)
                last_sync = token.get("_fetched_at")
            except (json.JSONDecodeError, TypeError):
                pass
    return {"connected": connected, "last_sync": last_sync}


@router.get("/auth-url")
async def calendar_auth_url():
    """Get Google OAuth authorization URL."""
    if not CALENDAR_ENABLED:
        raise HTTPException(status_code=400, detail="Calendar is disabled")
    url = get_auth_url()
    if not url:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    return {"auth_url": url}


@router.get("/callback")
async def calendar_callback(code: str, session: AsyncSession = Depends(get_session)):
    """Handle Google OAuth callback."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing code parameter")
    success = await handle_callback(session, code)
    if success:
        return RedirectResponse(url="http://localhost:5173?calendar=connected")
    raise HTTPException(status_code=500, detail="Failed to store credentials")


@router.get("/upcoming")
async def upcoming_events(session: AsyncSession = Depends(get_session)):
    """Get upcoming calendar events."""
    events = await get_upcoming_events(session)
    return {"events": events, "connected": len(events) > 0 or await _is_connected(session)}


async def _is_connected(db: AsyncSession) -> bool:
    from sqlalchemy import select
    from ..models.user import User
    result = await db.execute(select(User).where(User.login_status == "logged_in"))
    user = result.scalar()
    return user is not None and user.google_token_json is not None
