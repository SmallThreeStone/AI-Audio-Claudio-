import hmac
import time
import hashlib

from ..config import ADMIN_PASSWORD_HASH

_TTL_SECONDS = 12 * 60 * 60


def issue_admin_token() -> str:
    issued_at = str(int(time.time()))
    signature = hmac.new(
        ADMIN_PASSWORD_HASH.encode(),
        issued_at.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{issued_at}.{signature}"


def verify_admin_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    issued_at, signature = token.split(".", 1)
    if not issued_at.isdigit():
        return False
    if int(time.time()) - int(issued_at) > _TTL_SECONDS:
        return False
    expected = hmac.new(
        ADMIN_PASSWORD_HASH.encode(),
        issued_at.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
