import json
import logging
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_session
from ..models.user import User
from ..services.netease_client import netease

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _get_user_id(request: Request) -> int | None:
    return getattr(request.state, "user_id", None)


@router.post("/qr/start")
async def start_qr(request: Request, session: AsyncSession = Depends(get_session)):
    """Start QR login for the current client. Each client gets its own QR code."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"code": 400, "message": "Missing client identity"}

    key_data = await netease.qr_key()
    unikey = key_data.get("data", {}).get("unikey", "")
    qr_data = await netease.qr_create(unikey)
    qr_img = qr_data.get("data", {}).get("qrimg", "")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if user:
        user.qr_key = unikey
        if user.login_status != "logged_in":
            user.login_status = "qr_pending"
        await session.commit()

    return {"qr_key": unikey, "qr_url": qr_img}


@router.get("/qr/status")
async def qr_status(request: Request, key: str, session: AsyncSession = Depends(get_session)):
    """Poll QR code status for the current client."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"code": 400, "message": "Missing client identity"}

    result = await netease.qr_check(key)

    code = result.get("code", 800)
    inner = result.get("data", {})

    if code == 200 and isinstance(inner, dict) and "code" in inner:
        logger.info(f"QR check nested response for key={key[:12]}...: inner_code={inner.get('code')}")
        code = inner.get("code", 800)
        cookie_str = inner.get("cookie", "")
        message = inner.get("message", "")
    else:
        cookie_str = result.get("cookie", "")
        message = result.get("message", "")

    logger.info(f"QR check key={key[:12]}... code={code} msg={message}")

    if code == 803:
        cookies = cookie_str
        cookie_dict = _parse_cookie_string(cookies)

        # Get user info from Netease
        account = await netease.user_account(cookie_dict)
        profile = account.get("profile", {})

        result_set = await session.execute(select(User).where(User.id == user_id))
        user = result_set.scalar()
        if user:
            user.netease_uid = str(profile.get("userId", ""))
            user.nickname = profile.get("nickname")
            user.avatar_url = profile.get("avatarUrl")
            user.cookies_json = json.dumps(cookie_dict)
            user.login_status = "logged_in"
            user.qr_key = None

            # Auto-promote first user to admin
            if user.role != "admin":
                from sqlalchemy import func
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
                "user_id": user.id,
                "client_id": user.client_id,
            }

    return {"code": code, "message": message}


@router.get("/status")
async def auth_status(request: Request, session: AsyncSession = Depends(get_session)):
    """Return auth status for the current client."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"logged_in": False}

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if user and user.login_status == "logged_in":
        return {
            "logged_in": True,
            "user_id": user.id,
            "client_id": user.client_id,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "role": user.role,
        }
    return {
        "logged_in": False,
        "user_id": user.id if user else None,
        "client_id": user.client_id if user else None,
    }


@router.post("/logout")
async def logout(request: Request, session: AsyncSession = Depends(get_session)):
    """Log out the current client."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"status": "ok"}

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if user:
        user.login_status = "logged_out"
        user.cookies_json = None
        user.qr_key = None
        await session.commit()
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
