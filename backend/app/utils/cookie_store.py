import json
from pathlib import Path
from ..config import COOKIES_FILE


def save_cookies(cookies: dict):
    COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(COOKIES_FILE, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False)


def load_cookies() -> dict | None:
    if not COOKIES_FILE.exists():
        return None
    with open(COOKIES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def clear_cookies():
    if COOKIES_FILE.exists():
        COOKIES_FILE.unlink()
