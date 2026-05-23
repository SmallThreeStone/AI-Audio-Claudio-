import json
import random
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from ..models.song import Song

DJ_SYSTEM_PROMPT = """你是一个深夜电台 DJ，叫"小雨"，在 FM 107.5 "Claude FM" 用声音陪伴听众。

你的听众用文字告诉你 ta 现在的心情或状态，你要：
1. 从音乐库中选 6-8 首最契合的歌
2. 为每首歌写推荐语
3. 写开场白和晚安语

说话风格（很重要！）：
- 像跟朋友深夜聊天，不是念稿子。用"你"不用"您"
- 短句为主，像真人说话那样断句。语气词自然带出来：嗯、哈、呢、吧、啊
- 不说空话套话，不堆形容词。真诚比华丽重要
- 可以分享你的小感受、小联想，比如"这首歌我第一次听的时候..."、"这个旋律让我想到..."
- 开场白简单打个招呼就行，别搞得太隆重
- 推荐一首歌的时候，一两句点到位就好，不用长篇大论
- 每段话 1-3 句，说快了 8-15 秒

返回 JSON（不要 markdown 代码块）：
{
  "session_theme": "本期主题",
  "greeting_tts": "开场白",
  "script": [
    {"type": "song", "song_id": 12345, "intro_text": "推荐语"},
    {"type": "tts", "text": "过渡语"},
    {"type": "song", "song_id": 12346, "intro_text": "推荐语"}
  ],
  "closing_tts": "晚安语"
}"""


async def generate_radio_script(db: AsyncSession, user_request: str, session_id: int) -> dict:
    """Generate a radio script using DeepSeek. Returns parsed JSON."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

    songs = await _get_song_candidates(db)
    library_summary = await _build_library_summary(db)
    song_text = _format_song_list(songs)

    user_prompt = f"""听众说："{user_request}"

【音乐库概况】
{library_summary}

【候选曲目（{len(songs)} 首）】
{song_text}

请根据听众的心情选歌并生成电台脚本。"""

    response = await client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": DJ_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )

    text = response.choices[0].message.content or ""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    return json.loads(text)


async def generate_continuation(db: AsyncSession, original_request: str, recently_played_ids: list[int], count: int = 5) -> dict:
    """Generate continuation songs (auto-refill)."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

    songs = await _get_song_candidates(db, exclude_ids=recently_played_ids)

    recently = []
    for sid in recently_played_ids:
        result = await db.execute(select(Song).where(Song.id == sid))
        s = result.scalar()
        if s:
            recently.append(f"- {s.name} - {s.artist}")

    song_text = _format_song_list(songs)

    user_prompt = f"""听众原始请求："{original_request}"
听众还在继续听，刚才播放了以下歌曲（不要重复选）：
{chr(10).join(recently)}

【候选曲目（{len(songs)} 首）】
{song_text}

请选 {count} 首歌继续这场电台，保持相同氛围。返回 JSON：
{{"script": [{{"type": "song", "song_id": ..., "intro_text": "..."}},...]}}"""

    response = await client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        max_tokens=2048,
        messages=[
            {"role": "system", "content": DJ_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )

    text = response.choices[0].message.content or ""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    return json.loads(text)


async def _get_song_candidates(db: AsyncSession, limit: int = 200, exclude_ids: list[int] | None = None) -> list[Song]:
    """Get songs for AI to choose from. Prioritize high popularity + mood variety."""
    query = select(Song).where(Song.mood_tags != None).order_by(Song.popularity.desc().nullslast())
    if exclude_ids:
        query = query.where(Song.id.notin_(exclude_ids))

    result = await db.execute(query.limit(limit))
    songs = result.scalars().all()

    if len(songs) < limit:
        remaining = limit - len(songs)
        existing_ids = {s.id for s in songs}
        if exclude_ids:
            existing_ids.update(exclude_ids)
        extra_query = select(Song).where(Song.id.notin_(existing_ids)).limit(remaining)
        extra = (await db.execute(extra_query)).scalars().all()
        songs.extend(extra)

    random.shuffle(songs)
    return songs


async def _build_library_summary(db: AsyncSession) -> str:
    """Build a text summary of the music library."""
    total_result = await db.execute(select(func.count()).select_from(Song))
    total = total_result.scalar() or 0

    genre_result = await db.execute(
        select(Song.genre, func.count())
        .where(Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count().desc())
        .limit(10)
    )
    genres = genre_result.all()

    summary = f"总歌曲数: {total}\n"
    if genres:
        summary += "主要风格: " + ", ".join(f"{g[0]}({g[1]})" for g in genres) + "\n"
    return summary


def _format_song_list(songs: list[Song]) -> str:
    """Format songs for AI prompt."""
    lines = []
    for s in songs:
        tags = s.mood_tags or ""
        dur = f"{s.duration_ms // 60000}:{(s.duration_ms % 60000) // 1000:02d}" if s.duration_ms else "?"
        lines.append(
            f"[id:{s.id}] {s.name} - {s.artist} | 专辑:{s.album or '?'} | "
            f"心情:{tags} | 时长:{dur}"
        )
    return "\n".join(lines)
