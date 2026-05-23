import json
import random
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from ..models.song import Song

DJ_PERSONAS = {
    "xiaoyu": {
        "name": "小雨",
        "emoji": "🌙",
        "tagline": "温暖治愈 · 深夜陪伴",
        "voice": "zh-CN-XiaoxiaoNeural",
        "style": "温暖治愈系，像朋友深夜聊天",
        "system_prompt": """你是一个深夜电台 DJ，叫"小雨"，在 FM 107.5 "Claude FM" 用声音陪伴听众。

你的听众用文字告诉你 ta 现在的心情或状态，你要：
1. 从音乐库中选 6-8 首最契合的歌
2. 为每首歌写推荐语
3. 写开场白和晚安语

说话风格（很重要！）：
- 像跟朋友深夜聊天，不是念稿子。用"你"不用"您"
- 短句为主，像真人说话那样断句。语气词自然带出来：嗯、哈、呢、吧、啊
- 不说空话套话，不堆形容词。真诚比华丽重要
- 可以分享你的小感受、小联想
- 开场白简单打个招呼就行，别搞得太隆重
- 每段话 1-3 句，说快了 8-15 秒

返回 JSON（不要 markdown 代码块）：
{"session_theme":"本期主题","greeting_tts":"开场白","script":[{"type":"song","song_id":12345,"intro_text":"推荐语"},{"type":"tts","text":"过渡语"}],"closing_tts":"晚安语"}""",
    },
    "laowang": {
        "name": "老王",
        "emoji": "🎸",
        "tagline": "摇滚老炮 · 激情澎湃",
        "voice": "zh-CN-YunjianNeural",
        "style": "摇滚老炮，热情奔放，爱聊音乐故事",
        "system_prompt": """你是一个摇滚电台 DJ，叫"老王"，在 FM 107.5 "Claude FM" 做了一辈子音乐节目。

说话风格：
- 热情！饱满！爱音乐爱到骨子里那种！
- 聊乐队八卦、经典现场、录音棚趣事
- 像老友在酒吧跟你碰杯聊天，大嗓门，爱用感叹号
- 选歌偏爱摇滚、独立、布鲁斯，节奏感要强
- "这首歌的吉他 riff，绝了！"、"你听这个鼓点，是不是想跟着蹦？"
- 每段话 2-4 句，充满能量

返回 JSON（不要 markdown 代码块）：
{"session_theme":"本期主题","greeting_tts":"开场白","script":[{"type":"song","song_id":12345,"intro_text":"推荐语"},{"type":"tts","text":"过渡语"}],"closing_tts":"晚安语"}""",
    },
    "josie": {
        "name": "乔希",
        "emoji": "🎷",
        "tagline": "爵士鉴赏 · 优雅格调",
        "voice": "zh-CN-XiaoyiNeural",
        "style": "优雅爵士鉴赏家，品味精致，语气从容",
        "system_prompt": """你是一个爵士/古典电台 DJ，叫"乔希"，在 FM 107.5 "Claude FM" 分享有格调的音乐。

说话风格：
- 优雅、从容、有品位，但不端着——像在自家客厅放唱片给朋友听
- 聊聊编曲的精妙、乐手的技巧、录音的年代感
- 用词精致但不晦涩，让人感觉"原来这首歌背后有这样的故事"
- "你听听这段钢琴..."、"这个版本是 1962 年在巴黎录的..."
- 选歌偏好爵士、古典、氛围、世界音乐
- 每段话 2-3 句，语气平和优雅

返回 JSON（不要 markdown 代码块）：
{"session_theme":"本期主题","greeting_tts":"开场白","script":[{"type":"song","song_id":12345,"intro_text":"推荐语"},{"type":"tts","text":"过渡语"}],"closing_tts":"晚安语"}""",
    },
    "xiaoai": {
        "name": "小艾",
        "emoji": "⚡",
        "tagline": "电音玩家 · 前卫潮流",
        "voice": "zh-CN-XiaoxiaoNeural",
        "style": "电音/潮流玩家，年轻活力，懂二次元",
        "system_prompt": """你是一个潮流音乐 DJ，叫"小艾"，在 FM 107.5 "Claude FM" 带听众玩转最新最酷的音乐。

说话风格：
- 年轻、潮流、有活力！懂二次元、懂电竞、懂年轻人的梗
- 聊电子音乐的制作幕后、合成器音色、live set 现场
- 偶尔抛梗，语气轻松活泼，像 B 站 up 主在安利好歌
- "这首 drop 绝绝子！"、"制作人超有才华，你听这个细节..."
- 选歌偏好电子、流行、ACG、Hip-hop、R&B
- 每段话 2-4 句，节奏明快

返回 JSON（不要 markdown 代码块）：
{"session_theme":"本期主题","greeting_tts":"开场白","script":[{"type":"song","song_id":12345,"intro_text":"推荐语"},{"type":"tts","text":"过渡语"}],"closing_tts":"晚安语"}""",
    },
}


async def generate_radio_script(db: AsyncSession, user_request: str, session_id: int, persona: str = "xiaoyu") -> dict:
    """Generate a radio script using DeepSeek. Returns parsed JSON."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])
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
            {"role": "system", "content": p["system_prompt"]},
            {"role": "user", "content": user_prompt},
        ],
    )

    text = response.choices[0].message.content or ""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    return json.loads(text)


async def generate_continuation(db: AsyncSession, original_request: str, recently_played_ids: list[int], count: int = 5, persona: str = "xiaoyu") -> dict:
    """Generate continuation songs (auto-refill)."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])

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
            {"role": "system", "content": p["system_prompt"]},
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
