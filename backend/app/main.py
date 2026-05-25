import json
import os
import time
import logging
from collections import defaultdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select

from .database import init_db, async_session
from .models.user import User
from .routers import auth, playlists, songs, radio, audio, ws, dlna, calendar, admin
from .services.sidecar_manager import sidecar
from .utils.auth import AuthMiddleware

logger = logging.getLogger(__name__)

# Rate limit constants
_RATE_LIMIT_MAX = 5  # max requests per window
_RATE_LIMIT_WINDOW = 60  # seconds
_rate_limit_store: dict[str, list[float]] = defaultdict(list)

# Rate limiter middleware — uses X-Client-Id as primary key, falls back to IP
class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/radio/request":
            client_key = request.headers.get("X-Client-Id") or (
                request.client.host if request.client else "unknown"
            )
            now = time.time()
            window_start = now - _RATE_LIMIT_WINDOW
            timestamps = [t for t in _rate_limit_store[client_key] if t > window_start]
            _rate_limit_store[client_key] = timestamps
            if len(timestamps) >= _RATE_LIMIT_MAX:
                retry = int(timestamps[0] + _RATE_LIMIT_WINDOW - now)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后再试", "retry_after": max(retry, 1)},
                )
            _rate_limit_store[client_key].append(now)
        return await call_next(request)


async def restore_session():
    """Restore NetEase login sessions for all users with stored cookies on startup."""
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.cookies_json != None)
        )
        users = result.scalars().all()

        if not users:
            return

        import httpx
        for user in users:
            try:
                cookies = json.loads(user.cookies_json or "{}")
                if not cookies:
                    continue
                async with httpx.AsyncClient() as client:
                    r = await client.get(
                        "http://127.0.0.1:3000/login/status",
                        cookies=cookies,
                        timeout=10,
                    )
                    data = r.json()
                # Check if cookies are still valid
                account = data.get("data", {}).get("account") or data.get("account")
                if account:
                    user.login_status = "logged_in"
                    logger.info(f"Restored session for user {user.id}: {user.nickname}")
                else:
                    logger.info(f"User {user.id} cookies expired, marking logged_out")
                    user.login_status = "logged_out"
            except Exception as e:
                logger.warning(f"Failed to restore session for user {user.id}: {e}")

        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await restore_session()
    try:
        await sidecar.start()
        print("[AI Radio] NetEase sidecar started on port 3000")
    except Exception as e:
        print(f"[AI Radio] WARNING: Sidecar failed to start: {e}")
        print("[AI Radio] Login/playback features will not work.")
    yield
    await sidecar.stop()


app = FastAPI(title="AI Radio - Claudio FM", version="3.2.0", lifespan=lifespan)

# CORS: allow all origins in dev; configure CORS_ORIGINS env var for production
_allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(playlists.router)
app.include_router(songs.router)
app.include_router(radio.router)
app.include_router(audio.router)
app.include_router(ws.router)
app.include_router(dlna.router)
app.include_router(calendar.router)
app.include_router(admin.router)

# Middleware order (innermost → outermost): CORS → Auth → RateLimit
# CORS already added above. AuthMiddleware injects request.state.user_id.
app.add_middleware(AuthMiddleware)
app.add_middleware(RateLimitMiddleware)

# Serve frontend static files in production (SPA fallback via middleware)
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(FRONTEND_DIR):
    from starlette.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    class SPAMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            # Let API, WebSocket, and static files pass through
            path = request.url.path
            if path.startswith("/api/") or path.startswith("/ws/") or path.startswith("/assets/"):
                return await call_next(request)
            # Serve frontend static file or fallback to index.html
            file_path = os.path.join(FRONTEND_DIR, path.lstrip("/")) if path != "/" else os.path.join(FRONTEND_DIR, "index.html")
            if path != "/" and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    app.add_middleware(SPAMiddleware)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "3.2.0"}


@app.get("/api/settings/voices")
async def list_voices():
    """List available Edge TTS voices for Chinese."""
    return {
        "voices": [
            {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "gender": "female", "style": "温暖活泼，适合治愈系 DJ"},
            {"id": "zh-CN-XiaoyiNeural", "name": "晓伊", "gender": "female", "style": "优雅知性，适合爵士/古典 DJ"},
            {"id": "zh-CN-YunjianNeural", "name": "云健", "gender": "male", "style": "活力青年，适合运动/潮流 DJ"},
            {"id": "zh-CN-YunxiNeural", "name": "云希", "gender": "male", "style": "成熟稳重，适合晚间新闻风 DJ"},
            {"id": "zh-CN-YunxiaNeural", "name": "云夏", "gender": "male", "style": "温暖男声，适合深夜陪伴 DJ"},
            {"id": "zh-CN-XiaochenNeural", "name": "晓辰", "gender": "female", "style": "清脆少女，适合轻快活泼 DJ"},
        ]
    }


@app.get("/api/settings/tts-provider")
async def get_tts_provider(request: Request):
    """Get current TTS provider preference."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return {"provider": "edge"}
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar()
        return {"provider": user.tts_provider if user else "edge"}


@app.post("/api/settings/tts-provider")
async def set_tts_provider(request: Request, data: dict):
    """Set TTS provider preference. Body: {"provider": "edge" | "fish"}"""
    provider = data.get("provider", "edge")
    if provider not in ("edge", "fish"):
        return JSONResponse(status_code=400, content={"detail": "provider must be 'edge' or 'fish'"})
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return JSONResponse(status_code=400, content={"detail": "No user"})
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar()
        if not user:
            return JSONResponse(status_code=400, content={"detail": "No logged-in user"})
        user.tts_provider = provider
        await session.commit()
        return {"provider": provider}
