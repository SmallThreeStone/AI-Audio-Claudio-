import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .database import init_db, async_session
from .models.user import User
from .routers import auth, playlists, songs, radio, audio, ws, dlna, calendar
from .services.sidecar_manager import sidecar
from .utils.cookie_store import load_cookies

logger = logging.getLogger(__name__)


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


app = FastAPI(title="AI Radio - Claudio FM", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


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
