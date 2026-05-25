"""AuthMiddleware: assigns request.state.user_id from X-Client-Id header.

Every API request must carry an X-Client-Id header. The middleware:
  1. Looks up User by client_id
  2. Binds orphaned logged-in users on first visit (migration path)
  3. Creates a pending User record for truly new visitors
  4. Injects request.state.user_id for downstream handlers

Whitelisted paths skip this entirely: /api/health
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy import select

from ..database import async_session
from ..models.user import User

logger = logging.getLogger(__name__)

_AUTH_WHITELIST = {"/api/health"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _AUTH_WHITELIST:
            return await call_next(request)

        # Only intercept API routes; static/assets/WS pass through
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        client_id = request.headers.get("X-Client-Id")

        async with async_session() as session:
            user = None

            if client_id:
                result = await session.execute(
                    select(User).where(User.client_id == client_id)
                )
                user = result.scalar()

            if not user and client_id:
                # Migration path: bind an existing logged-in user that has no client_id yet
                result = await session.execute(
                    select(User).where(
                        User.client_id == None,
                        User.login_status == "logged_in",
                    )
                )
                orphan = result.scalar()
                if orphan:
                    orphan.client_id = client_id
                    await session.commit()
                    user = orphan

            if not user:
                user = User(
                    client_id=client_id,
                    login_status="pending",
                )
                session.add(user)
                await session.commit()

            request.state.user_id = user.id

        return await call_next(request)
