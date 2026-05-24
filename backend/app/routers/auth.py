import json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_session
from ..models.user import User
from ..services.netease_client import netease
from ..utils.cookie_store import save_cookies, clear_cookies
from sqlalchemy import func

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/qr/start")
async def start_qr(session: AsyncSession = Depends(get_session)):
    key_data = await netease.qr_key()
    unikey = key_data.get("data", {}).get("unikey", "")
    qr_data = await netease.qr_create(unikey)
    qr_img = qr_data.get("data", {}).get("qrimg", "")

    result = await session.execute(select(User).limit(1))
    user = result.scalar()
    if not user:
        user = User(login_status="qr_pending", qr_key=unikey)
        session.add(user)
    else:
        user.qr_key = unikey
        if user.login_status != "logged_in":
            user.login_status = "qr_pending"
    await session.commit()

    return {"qr_key": unikey, "qr_url": qr_img}


@router.get("/qr/status")
async def qr_status(key: str, session: AsyncSession = Depends(get_session)):
    result = await netease.qr_check(key)

    # The @neteasecloudmusicapienhanced/api fork may wrap responses in data{}
    code = result.get("code", 800)
    inner = result.get("data", {})

    # If top-level code is 200 but inner has the real status, use inner
    if code == 200 and isinstance(inner, dict) and "code" in inner:
        logger.info(f"QR check nested response for key={key[:12]}...: inner_code={inner.get('code')}")
        code = inner.get("code", 800)
        cookie_str = inner.get("cookie", "")
        message = inner.get("message", "")
    else:
        cookie_str = result.get("cookie", "")
        message = result.get("message", "")

    logger.info(f"QR check key={key[:12]}... code={code} msg={message}")

    # Status codes: 800=expired, 801=waiting, 802=scanned, 803=success
    if code == 803:
        cookies = cookie_str
        cookie_dict = _parse_cookie_string(cookies)

        save_cookies(cookie_dict)

        # Get user info
        account = await netease.user_account(cookie_dict)
        profile = account.get("profile", {})

        result_set = await session.execute(select(User).limit(1))
        user = result_set.scalar()
        if user:
            user.netease_uid = profile.get("userId")
            user.nickname = profile.get("nickname")
            user.avatar_url = profile.get("avatarUrl")
            user.cookies_json = json.dumps(cookie_dict)
            user.login_status = "logged_in"

            # Auto-promote first user to admin
            if user.role != "admin":
                count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
                if count <= 1:
                    user.role = "admin"

            await session.commit()

            return {
                "code": 803,
                "message": "登录成功",
                "nickname": profile.get("nickname"),
                "avatar_url": profile.get("avatarUrl"),
                "role": user.role,
            }

    return {"code": code, "message": message}


@router.get("/status")
async def auth_status(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).limit(1))
    user = result.scalar()
    if user and user.login_status == "logged_in":
        return {"logged_in": True, "nickname": user.nickname, "avatar_url": user.avatar_url, "role": user.role}
    return {"logged_in": False}


@router.post("/logout")
async def logout(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).limit(1))
    user = result.scalar()
    if user:
        user.login_status = "logged_out"
        await session.commit()
    clear_cookies()
    return {"status": "ok"}


def _parse_cookie_string(cookie_str: str) -> dict:
    """Parse 'MUSIC_U=xxx; __csrf=yyy' into dict."""
    cookies = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies
