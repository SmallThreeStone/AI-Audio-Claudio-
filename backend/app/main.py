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
from .utils.cookie_store import load_cookies

logger = logging.getLogger(__name__)

# Rate limit constants
_RATE_LIMIT_MAX = 5  # max requests per window
_RATE_LIMIT_WINDOW = 60  # seconds
_rate_limit_store: dict[str, list[float]] = defaultdict(list)

# Rate limiter middleware (always active, not gated by FRONTEND_DIR)
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple IP-based rate limiter for radio request endpoint."""
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/api/radio/request":
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            window_start = now - _RATE_LIMIT_WINDOW
            timestamps = [t for t in _rate_limit_store[client_ip] if t > window_start]
            _rate_limit_store[client_ip] = timestamps
            if len(timestamps) >= _RATE_LIMIT_MAX:
                # retry_after = seconds until the oldest request expires
                retry = int(timestamps[0] + _RATE_LIMIT_WINDOW - now)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "请求过于频繁，请稍后再试", "retry_after": max(retry, 1)},
                )
            _rate_limit_store[client_ip].append(now)
        return await call_next(request)


async def restore_session():
    """Restore NetEase login session from saved cookies on startup."""
    cookies = load_cookies()
    if not cookies:
        return

    async with async_session() as session:
        result = await session.execute(select(User).limit(1))
        user = result.scalar()

        if not user:
            # Create user from saved cookies if DB was reset
            import httpx
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get("http://127.0.0.1:3000/user/account", cookies=cookies, timeout=10)
                    data = r.json()
                profile = data.get("profile", {})
                user = User(
                    netease_uid=str(profile.get("userId", "")),
                    nickname=profile.get("nickname", ""),
                    avatar_url=profile.get("avatarUrl", ""),
                    cookies_json=json.dumps(cookies),
                    login_status="logged_in",
                )
                session.add(user)
                logger.info(f"Restored session for user: {user.nickname}")
            except Exception as e:
                logger.warning(f"Failed to create user from cookies: {e}")
                return
        else:
            user.cookies_json = json.dumps(cookies)
            user.login_status = "logged_in"

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


app = FastAPI(title="AI Radio - Claudio FM", version="3.1.0", lifespan=lifespan)

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

# Rate limiter (always active, not gated by production mode)
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
    return {"status": "ok", "version": "3.1.0"}


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
async def get_tts_provider():
    """Get current TTS provider preference."""
    from .models.user import User
    async with async_session() as session:
        result = await session.execute(select(User).where(User.login_status == "logged_in"))
        user = result.scalar()
        return {"provider": user.tts_provider if user else "edge"}


@app.post("/api/settings/tts-provider")
async def set_tts_provider(data: dict):
    """Set TTS provider preference. Body: {"provider": "edge" | "fish"}"""
    provider = data.get("provider", "edge")
    if provider not in ("edge", "fish"):
        return JSONResponse(status_code=400, content={"detail": "provider must be 'edge' or 'fish'"})
    from .models.user import User
    async with async_session() as session:
        result = await session.execute(select(User).where(User.login_status == "logged_in"))
        user = result.scalar()
        if not user:
            return JSONResponse(status_code=400, content={"detail": "No logged-in user"})
        user.tts_provider = provider
        await session.commit()
        return {"provider": provider}
