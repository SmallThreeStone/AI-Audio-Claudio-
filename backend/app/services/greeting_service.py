import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..models.song import Song
from ..models.listening_history import ListeningHistory
from ..config import WEATHER_ENABLED


def _time_greeting() -> tuple[str, str]:
    """Return (label, mood) based on current hour."""
    h = datetime.datetime.now().hour
    if 5 <= h < 8:
        return "早上好", "清新、元气"
    elif 8 <= h < 12:
        return "上午好", "轻快、有节奏"
    elif 12 <= h < 14:
        return "中午好", "慵懒、助消化"
    elif 14 <= h < 18:
        return "下午好", "提神、有能量"
    elif 18 <= h < 21:
        return "傍晚好", "放松、氛围感"
    elif 21 <= h < 23:
        return "晚上好", "温暖、安静"
    else:
        return "深夜好", "舒缓、陪伴感"


async def _recent_artists(db: AsyncSession, user_id: int | None = None, days: int = 3) -> list[str]:
    """Get artists the user listened to in recent days."""
    since = datetime.datetime.now() - datetime.timedelta(days=days)
    query = (
        select(Song.artist, func.count().label("c"))
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .where(
            ListeningHistory.event == "started",
            ListeningHistory.listened_at >= since,
            Song.artist != None,
        )
    )
    if user_id is not None:
        query = query.where(ListeningHistory.user_id == user_id)
    result = await db.execute(
        query.group_by(Song.artist)
        .order_by(func.count().desc())
        .limit(5)
    )
    return [row[0] for row in result.all() if row[0]]


async def _top_mood_in_time_slot(db: AsyncSession, user_id: int | None = None) -> str:
    """Find the most-played mood/genre during the current time slot."""
    query = (
        select(Song.genre, func.count().label("c"))
        .join(ListeningHistory, ListeningHistory.song_id == Song.id)
        .where(
            ListeningHistory.event == "started",
            ListeningHistory.listened_at >= datetime.datetime.now() - datetime.timedelta(days=30),
            Song.genre != None,
        )
    )
    if user_id is not None:
        query = query.where(ListeningHistory.user_id == user_id)
    result = await db.execute(
        query.group_by(Song.genre)
        .order_by(func.count().desc())
        .limit(5)
    )
    genres = [row[0] for row in result.all() if row[0]]
    return genres[0] if genres else ""


async def build_greeting(db: AsyncSession, weather_summary: str | None = None, user_id: int | None = None) -> dict:
    """Build a context-aware greeting. Returns {greeting_text, suggested_mood}."""
    time_label, time_mood = _time_greeting()
    artists = await _recent_artists(db, user_id)
    top_genre = await _top_mood_in_time_slot(db, user_id)

    greeting_parts = [time_label]

    # Weather
    if weather_summary:
        short = weather_summary.split("。")[0].replace("今天天气", "今天")
        if len(short) > 20:
            short = short[:20]
        greeting_parts.append(short)

    # Recent artists hook
    if artists:
        arty = "、".join(artists[:3])
        greeting_parts.append(f"你最近在听 {arty}")

    # Genre hint
    suggested_mood = time_mood
    if top_genre:
        suggested_mood = f"{time_mood}、{top_genre}"

    greeting_text = "，".join(greeting_parts) + "。"

    return {
        "greeting_text": greeting_text,
        "suggested_mood": suggested_mood,
        "time_label": time_label,
        "time_mood": time_mood,
        "recent_artists": artists[:5],
        "top_genre": top_genre,
    }
