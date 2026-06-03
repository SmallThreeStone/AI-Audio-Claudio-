import json
import hashlib
import logging
import asyncio
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import ADMIN_PASSWORD_HASH
from ..database import get_session, async_session
from ..models.user import User
from ..services.netease_client import netease
from ..utils.admin_token import issue_admin_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_qr_poll_tasks: dict[int, asyncio.Task] = {}


def _get_user_id(request: Request) -> int | None:
    return getattr(request.state, "user_id", None)


def _extract_qr_result(result: dict) -> tuple[int, str, str]:
    code = result.get("code", 800)
    inner = result.get("data", {})
    if code == 200 and isinstance(inner, dict) and "code" in inner:
        logger.info(f"QR check nested response: inner_code={inner.get('code')}")
        return inner.get("code", 800), inner.get("cookie", ""), inner.get("message", "")
    return code, result.get("cookie", ""), result.get("message", "")


async def _save_qr_login(user_id: int, cookie_str: str, session: AsyncSession) -> dict:
    cookie_dict = _parse_cookie_string(cookie_str)
    profile = {}
    for attempt in range(3):
        try:
            account = await netease.user_account(cookie_dict)
            profile = account.get("profile", {})
            if profile:
                break
        except Exception:
            if attempt == 2:
                logger.warning(f"user_account failed after 3 retries for user_id={user_id}, saving cookies anyway")
            else:
                await asyncio.sleep(1.0)

    result_set = await session.execute(select(User).where(User.id == user_id))
    user = result_set.scalar()
    if not user:
        return {"code": 500, "message": "用户不存在"}

    raw_uid = profile.get("userId")
    user.netease_uid = int(raw_uid) if raw_uid else None
    user.nickname = profile.get("nickname") or (user.nickname or "")
    user.avatar_url = profile.get("avatarUrl") or user.avatar_url
    user.cookies_json = json.dumps(cookie_dict)
    user.login_status = "logged_in"
    user.qr_key = None

    if user.role != "admin":
        from sqlalchemy import func
        count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
        if count <= 1:
            user.role = "admin"

    await session.commit()

    from sqlalchemy import func as _func
    from ..models.song import Song
    song_count = (await session.execute(select(_func.count()).select_from(Song))).scalar() or 0

    return {
        "code": 803,
        "message": "登录成功",
        "nickname": user.nickname,
        "avatar_url": user.avatar_url,
        "role": user.role,
        "user_id": user.id,
        "client_id": user.client_id,
        "auto_sync": song_count == 0,
    }


async def _poll_qr_login(user_id: int, key: str):
    deadline = asyncio.get_running_loop().time() + 180
    while asyncio.get_running_loop().time() < deadline:
        try:
            result = await netease.qr_check(key)
            code, cookie_str, message = _extract_qr_result(result)
            logger.info(f"QR background key={key[:12]}... code={code} msg={message}")
            if code == 803 and cookie_str:
                async with async_session() as session:
                    await _save_qr_login(user_id, cookie_str, session)
                return
        except Exception as e:
            logger.warning(f"QR background poll failed user_id={user_id}: {e}")
        await asyncio.sleep(1.0)


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

    old_task = _qr_poll_tasks.get(user_id)
    if old_task and not old_task.done():
        old_task.cancel()
    _qr_poll_tasks[user_id] = asyncio.create_task(_poll_qr_login(user_id, unikey))

    return {"qr_key": unikey, "qr_url": qr_img}


@router.get("/qr/status")
async def qr_status(request: Request, key: str, session: AsyncSession = Depends(get_session)):
    """Poll QR code status for the current client."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"code": 400, "message": "Missing client identity"}

    result_set = await session.execute(select(User).where(User.id == user_id))
    current_user = result_set.scalar()
    if current_user and current_user.login_status == "logged_in" and current_user.cookies_json:
        return {
            "code": 803,
            "message": "登录成功",
            "nickname": current_user.nickname,
            "avatar_url": current_user.avatar_url,
            "role": current_user.role,
            "user_id": current_user.id,
            "client_id": current_user.client_id,
            "auto_sync": False,
        }

    result = await netease.qr_check(key)
    code, cookie_str, message = _extract_qr_result(result)

    logger.info(f"QR check key={key[:12]}... code={code} msg={message}")

    if code == 803:
        return await _save_qr_login(user_id, cookie_str, session)

    return {"code": code, "message": message}


@router.post("/login/phone/captcha")
async def send_captcha(request: Request):
    """Send SMS verification code to phone number."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"code": 400, "message": "Missing client identity"}

    body = await request.json()
    phone = (body.get("phone") or "").strip()
    countrycode = (body.get("countrycode") or "86").strip()

    if not phone:
        return {"code": 400, "message": "请输入手机号"}

    try:
        result = await netease.captcha_sent(phone, countrycode)
    except Exception as e:
        logger.error(f"Captcha send failed: {e}")
        return {"code": 500, "message": "验证码发送失败，请稍后重试"}

    captcha_code = result.get("code", result.get("body", {}).get("code", 500))
    if captcha_code == 200:
        return {"code": 200, "message": "验证码已发送"}
    else:
        msg = result.get("message") or result.get("body", {}).get("message") or "验证码发送失败"
        return {"code": captcha_code, "message": msg}


@router.post("/login/phone")
async def phone_login(request: Request, session: AsyncSession = Depends(get_session)):
    """Login with phone number + password or captcha."""
    user_id = _get_user_id(request)
    if not user_id:
        return {"code": 400, "message": "Missing client identity"}

    body = await request.json()
    phone = (body.get("phone") or "").strip()
    password = (body.get("password") or "").strip()
    captcha = (body.get("captcha") or "").strip()
    countrycode = (body.get("countrycode") or "86").strip()

    if not phone:
        return {"code": 400, "message": "请输入手机号"}
    if not captcha and not password:
        return {"code": 400, "message": "请输入密码或验证码"}

    try:
        result = await netease.phone_login(phone, password, countrycode, captcha)
    except Exception as e:
        logger.error(f"Phone login failed: {e}")
        return {"code": 500, "message": "登录服务异常，请稍后重试"}

    body_data = result.get("body", {})
    code = body_data.get("code", result.get("code", 500))

    if code != 200:
        msg = result.get("message") or result.get("msg") or body_data.get("message") or body_data.get("msg") or "登录失败"
        return {"code": code, "message": msg}

    cookie_str = body_data.get("cookie", "")
    if not cookie_str and "cookie" in result:
        c = result["cookie"]
        cookie_str = ";".join(c) if isinstance(c, list) else str(c)

    if not cookie_str:
        return {"code": 500, "message": "登录成功但未获取到凭证，请重试"}

    cookie_dict = _parse_cookie_string(cookie_str)
    profile = body_data.get("profile", {})
    account = body_data.get("account", {})

    result_set = await session.execute(select(User).where(User.id == user_id))
    user = result_set.scalar()
    if user:
        raw_uid = profile.get("userId") or account.get("id")
        user.netease_uid = int(raw_uid) if raw_uid else None
        user.nickname = profile.get("nickname") or (user.nickname or "")
        user.avatar_url = profile.get("avatarUrl") or user.avatar_url
        user.cookies_json = json.dumps(cookie_dict)
        user.login_status = "logged_in"

        # Auto-promote first user to admin
        if user.role != "admin":
            from sqlalchemy import func
            count = (await session.execute(select(func.count()).select_from(User))).scalar() or 0
            if count <= 1:
                user.role = "admin"

        await session.commit()

        # Check if user needs auto-sync
        from sqlalchemy import func as _func
        from ..models.song import Song
        song_count = (await session.execute(select(_func.count()).select_from(Song))).scalar() or 0

        return {
            "code": 200,
            "message": "登录成功",
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "user_id": user.id,
            "client_id": user.client_id,
            "auto_sync": song_count == 0,
        }

    return {"code": 500, "message": "用户不存在"}


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


@router.post("/admin/verify")
async def admin_verify(request: Request):
    """Verify admin password before granting access to the admin dashboard."""
    body = await request.json()
    password = (body.get("password") or "").strip()

    if not password:
        return {"valid": False, "message": "请输入密码"}

    hashed = hashlib.sha256(password.encode()).hexdigest()
    if hashed == ADMIN_PASSWORD_HASH:
        return {"valid": True, "admin_token": issue_admin_token()}
    return {"valid": False, "message": "密码错误"}


_COOKIE_ATTRS = {"path", "httponly", "secure", "expires", "domain", "samesite", "max-age"}

def _parse_cookie_string(cookie_str: str) -> dict:
    """Parse 'MUSIC_U=xxx; __csrf=yyy' into dict, filtering cookie attributes."""
    cookies = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            k = k.strip()
            if k.lower() in _COOKIE_ATTRS:
                continue
            cookies[k] = v.strip()
    return cookies
