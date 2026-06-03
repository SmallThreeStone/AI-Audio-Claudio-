import datetime
import json
import random
from collections import Counter

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..models.song import Song
from ..models.playlist import Playlist
from ..models.playlist_song import playlist_song_table
from ..models.listening_history import ListeningHistory


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


async def _library_snapshot(db: AsyncSession, user_id: int | None = None) -> dict:
    song_query = select(Song)
    playlist_query = select(Playlist.name).order_by(Playlist.last_synced.desc().nullslast(), Playlist.created_at.desc()).limit(5)
    if user_id is not None:
        song_query = (
            song_query
            .join(playlist_song_table, playlist_song_table.c.song_id == Song.id)
            .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
            .where(Playlist.user_id == user_id)
            .distinct()
        )
        playlist_query = playlist_query.where(Playlist.user_id == user_id)

    total_result = await db.execute(select(func.count()).select_from(song_query.subquery()))
    total_songs = total_result.scalar() or 0

    artist_result = await db.execute(
        song_query
        .with_only_columns(Song.artist, func.count(func.distinct(Song.id)).label("c"))
        .where(Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.count(func.distinct(Song.id)).desc())
        .limit(8)
    )
    artists = [row[0] for row in artist_result.all() if row[0]]

    genre_result = await db.execute(
        song_query
        .with_only_columns(Song.genre, func.count(func.distinct(Song.id)).label("c"))
        .where(Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count(func.distinct(Song.id)).desc())
        .limit(6)
    )
    genres = [row[0] for row in genre_result.all() if row[0]]

    mood_result = await db.execute(
        song_query
        .with_only_columns(Song.mood_tags)
        .where(Song.mood_tags != None)
        .limit(160)
    )
    mood_counter: Counter[str] = Counter()
    for (raw_tags,) in mood_result.all():
        try:
            tags = json.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(tags, list):
            mood_counter.update(str(tag) for tag in tags if tag)

    playlist_result = await db.execute(playlist_query)
    playlists = [row[0] for row in playlist_result.all() if row[0]]

    return {
        "total_songs": total_songs,
        "artists": artists,
        "genres": genres,
        "moods": [tag for tag, _ in mood_counter.most_common(8)],
        "playlists": playlists,
    }


def _weather_hint(weather_summary: str | None) -> str:
    if not weather_summary:
        return ""
    first = weather_summary.split("。")[0].strip()
    return first[:34]


async def build_greeting(db: AsyncSession, weather_summary: str | None = None, user_id: int | None = None) -> dict:
    """Build a context-aware greeting. Returns {greeting_text, suggested_mood}."""
    time_label, time_mood = _time_greeting()
    now = datetime.datetime.now()
    time_text = now.strftime("%H:%M")
    weekday = "一二三四五六日"[now.weekday()]
    artists = await _recent_artists(db, user_id)
    top_genre = await _top_mood_in_time_slot(db, user_id)
    library = await _library_snapshot(db, user_id)

    greeting_parts = [time_label]

    # Weather
    if weather_summary:
        short = _weather_hint(weather_summary).replace("今天天气", "今天")
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
    weather_scene = _weather_hint(weather_summary)
    if weather_scene:
        personalized_prompts.append(f"{weather_scene}，来点{time_mood}的歌")
    if artists:
        for a in artists[:3]:
            personalized_prompts.append(f"最近听{a}，继续这个感觉")
    for a in library["artists"][:2]:
        personalized_prompts.append(f"从我的歌单里找点{a}的氛围")
    if top_genre:
        personalized_prompts.append(f"{time_label}，想听{top_genre}但别太散")
    elif library["genres"]:
        personalized_prompts.append(f"{time_label}，从{library['genres'][0]}里挑几首")
    personalized_prompts.append(f"{time_text}了，来点{time_mood}的旋律")
    # Deduplicate and limit to 5
    seen = set()
    unique_prompts = []
    for p in personalized_prompts:
        if p not in seen:
            seen.add(p)
            unique_prompts.append(p)
    unique_prompts = unique_prompts[:5]

    scene_context = {
        "time_label": time_label,
        "time_mood": time_mood,
        "time_text": time_text,
        "weekday": f"周{weekday}",
        "weather": weather_summary or "",
        "recent_artists": artists[:5],
        "library_artists": library["artists"][:6],
        "library_genres": library["genres"][:5],
        "library_moods": library["moods"][:6],
        "playlists": library["playlists"][:4],
        "total_songs": library["total_songs"],
    }
    ai_prompts = await _generate_ai_prompts(scene_context)
    prompt_source = "ai" if ai_prompts else "context"
    context_badges = [time_text, f"周{weekday}", time_mood]
    if weather_summary:
        context_badges.append(_weather_hint(weather_summary))
    if library["total_songs"]:
        context_badges.append(f"{library['total_songs']} 首曲库")

    return {
        "greeting_text": greeting_text,
        "suggested_mood": suggested_mood,
        "time_label": time_label,
        "time_mood": time_mood,
        "time_text": time_text,
        "weather_summary": weather_summary,
        "recent_artists": artists[:5],
        "top_genre": top_genre,
        "personalized_prompts": unique_prompts,
        "ai_prompts": ai_prompts,
        "prompt_source": prompt_source,
        "context_badges": context_badges[:5],
    }


async def _generate_ai_prompts(scene_context: dict) -> list[str]:
    """Generate natural-language quick prompts via DeepSeek. Returns empty list on failure."""
    import asyncio
    from openai import AsyncOpenAI
    from ..config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

    if not DEEPSEEK_API_KEY:
        return []

    context_json = json.dumps(scene_context, ensure_ascii=False)
    seed = random.randint(1000, 9999)

    prompt = f"""你是 iRadio 的 AI 电台调度员。根据上下文生成 4 条用户可直接点击的点播指令。

上下文 JSON：
{context_json}

要求：
- 必须体现至少 2 类当下场景信号，例如具体时间、星期、天气/城市、最近在听、曲库歌手、歌单风格。
- 每条 12-24 个中文字符，像用户自己会说的话。
- 不要写“推荐”“播放列表”“AI”等系统词。
- 4 条之间风格要明显不同，有的偏艺人、有的偏天气/时间、有的偏心情。
- 不要复用这些模板：来点某某风格的歌、想听某某类型的音乐、今天心情很好。
- 随机种子：{seed}

返回 JSON 格式: {{"prompts": ["指令1", "指令2", "指令3", "指令4"]}}
只返回 JSON，不要其他文字。"""

    try:
        client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=8.0)
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=260,
                temperature=1.05,
            ),
            timeout=6.0,
        )
        text = resp.choices[0].message.content
        if text:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(text[start:end])
                prompts = data.get("prompts", [])
                cleaned = []
                seen = set()
                for item in prompts:
                    p = str(item).strip(" 「」\"'")
                    if 6 <= len(p) <= 32 and p not in seen:
                        seen.add(p)
                        cleaned.append(p)
                return cleaned[:4]
    except Exception:
        pass

    return []
