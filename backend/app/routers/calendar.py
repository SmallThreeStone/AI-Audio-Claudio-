import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import FRONTEND_URL
from ..database import get_session
from ..models.user import User
from ..services.calendar_service import (
    get_auth_url, handle_callback, get_upcoming_events,
)
from ..config import CALENDAR_ENABLED

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/status")
async def calendar_status(request: Request, session: AsyncSession = Depends(get_session)):
    """Get Google Calendar connection status."""
    user_id = getattr(request.state, "user_id", None)
    connected = await _is_connected(session, user_id)
    last_sync = None
    if connected and user_id:
        result = await session.execute(select(User).where(User.id == user_id))
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
async def calendar_auth_url(request: Request):
    """Get Google OAuth authorization URL."""
    if not CALENDAR_ENABLED:
        raise HTTPException(status_code=400, detail="Calendar is disabled")
    user_id = getattr(request.state, "user_id", None)
    state = json.dumps({"user_id": user_id}) if user_id else None
    url = get_auth_url(state)
    if not url:
        raise HTTPException(status_code=400, detail="Google OAuth not configured")
    return {"auth_url": url}


@router.get("/callback")
async def calendar_callback(code: str, state: str = "", session: AsyncSession = Depends(get_session)):
    """Handle Google OAuth callback."""
    if not code:
        raise HTTPException(status_code=400, detail="Missing code parameter")
    user_id = None
    if state:
        try:
            user_id = json.loads(state).get("user_id")
        except (json.JSONDecodeError, TypeError):
            pass
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user identity in OAuth state")
    success = await handle_callback(session, code, user_id)
    if success:
        return RedirectResponse(url=f"{FRONTEND_URL}?calendar=connected")
    raise HTTPException(status_code=500, detail="Failed to store credentials")


@router.get("/upcoming")
async def upcoming_events(request: Request, session: AsyncSession = Depends(get_session)):
    """Get upcoming calendar events."""
    user_id = getattr(request.state, "user_id", None)
    events = await get_upcoming_events(session, user_id)
    return {"events": events, "connected": len(events) > 0 or await _is_connected(session, user_id)}


async def _is_connected(db: AsyncSession, user_id: int | None) -> bool:
    if not user_id:
        return False
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    return user is not None and user.google_token_json is not None
