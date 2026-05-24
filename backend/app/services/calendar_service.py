import json
import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALENDAR_ENABLED
from ..models.user import User

_SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
_REDIRECT_URI = "http://localhost:8000/api/calendar/callback"


def get_auth_url() -> str | None:
    """Generate Google OAuth authorization URL."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [_REDIRECT_URI],
            }
        },
        scopes=_SCOPES,
        redirect_uri=_REDIRECT_URI,
    )
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    return url


async def handle_callback(db: AsyncSession, code: str) -> bool:
    """Exchange OAuth code for token and store it."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return False

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [_REDIRECT_URI],
            }
        },
        scopes=_SCOPES,
        redirect_uri=_REDIRECT_URI,
    )
    flow.fetch_token(code=code)

    creds = flow.credentials
    token_json = creds.to_json()

    result = await db.execute(select(User).where(User.login_status == "logged_in"))
    user = result.scalar()
    if user:
        user.google_token_json = token_json
        await db.commit()
        return True
    return False


async def _get_credentials(db: AsyncSession) -> Credentials | None:
    """Load stored Google credentials for the logged-in user."""
    result = await db.execute(select(User).where(User.login_status == "logged_in"))
    user = result.scalar()
    if not user or not user.google_token_json:
        return None

    try:
        creds = Credentials.from_authorized_user_info(
            json.loads(user.google_token_json), _SCOPES
        )
        return creds
    except Exception:
        return None


async def get_upcoming_events(db: AsyncSession, max_results: int = 5) -> list[dict]:
    """Fetch upcoming calendar events. Returns list of {summary, start_time, end_time}."""
    if not CALENDAR_ENABLED:
        return []

    creds = await _get_credentials(db)
    if not creds:
        return []

    try:
        service = build("calendar", "v3", credentials=creds)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        events_result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=now,
                maxResults=max_results,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
    except Exception:
        return []

    events = events_result.get("items", [])
    result = []
    for e in events:
        start = e["start"].get("dateTime", e["start"].get("date"))
        end = e["end"].get("dateTime", e["end"].get("date"))
        result.append({
            "summary": e.get("summary", "忙碌"),
            "start": start,
            "end": end,
            "minutes_until": None,
        })
        # Calculate minutes until event
        try:
            if "T" in start:
                start_dt = datetime.datetime.fromisoformat(start)
                delta = start_dt - datetime.datetime.now(datetime.timezone.utc)
                result[-1]["minutes_until"] = max(0, int(delta.total_seconds() / 60))
        except Exception:
            pass

    return result


def build_calendar_summary(events: list[dict]) -> str | None:
    """Build a calendar context string for DJ prompt injection."""
    if not events:
        return None

    soon = [e for e in events if e.get("minutes_until") is not None and e["minutes_until"] <= 120]
    if not soon:
        return None

    parts = []
    for e in soon[:2]:
        mins = e["minutes_until"]
        summary = e["summary"]
        parts.append(f"{mins}分钟后有「{summary}」")

    if parts:
        return "，".join(parts) + "。记得选歌时考虑时间节奏。"

    return None
