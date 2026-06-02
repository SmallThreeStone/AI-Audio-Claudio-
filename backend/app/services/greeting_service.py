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

    # Build personalized quick prompts from available context
    personalized_prompts: list[str] = []
    if artists:
        for a in artists[:3]:
            personalized_prompts.append(f"来点{a}风格的歌")
    if top_genre:
        personalized_prompts.append(f"想听{top_genre}类型的音乐")
    if weather_summary:
        personalized_prompts.append(f"{time_label.split('好')[0]}的天气，来点{time_mood}的音乐")
    personalized_prompts.append(f"{time_label}，{time_mood}的旋律")
    # Deduplicate and limit to 5
    seen = set()
    unique_prompts = []
    for p in personalized_prompts:
        if p not in seen:
            seen.add(p)
            unique_prompts.append(p)
    unique_prompts = unique_prompts[:5]

    # Try AI-generated prompts for richer suggestions (non-blocking, 1.5s timeout)
    ai_prompts = await _generate_ai_prompts(greeting_text, suggested_mood, artists[:3], top_genre)

    return {
        "greeting_text": greeting_text,
        "suggested_mood": suggested_mood,
        "time_label": time_label,
        "time_mood": time_mood,
        "recent_artists": artists[:5],
        "top_genre": top_genre,
        "personalized_prompts": unique_prompts,
        "ai_prompts": ai_prompts,
    }


async def _generate_ai_prompts(greeting: str, mood: str, artists: list[str], genre: str) -> list[str]:
    """Generate natural-language quick prompts via DeepSeek. Returns empty list on failure."""
    import asyncio
    from openai import AsyncOpenAI
    from ..config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

    if not DEEPSEEK_API_KEY:
        return []

    context_parts = [f"当前场景: {greeting}"]
    if artists:
        context_parts.append(f"用户最近在听: {'、'.join(artists)}")
    if genre:
        context_parts.append(f"偏好风格: {genre}")
    if mood:
        context_parts.append(f"推荐情绪: {mood}")

    prompt = f"""你是 AI 电台 DJ。根据以下上下文，生成 3 条个性化的音乐点播建议。每条 8-15 个字，像用户自己会说的话，不要重复模板。

{chr(10).join(context_parts)}

返回 JSON 格式: {{"prompts": ["建议1", "建议2", "建议3"]}}
只返回 JSON，不要其他文字。"""

    try:
        client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=5.0)
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.9,
            ),
            timeout=3.0,
        )
        text = resp.choices[0].message.content
        if text:
            import json
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(text[start:end])
                return data.get("prompts", [])[:3]
    except Exception:
        pass

    return []
