import json
import random
from datetime import datetime
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
        "emotion_tags": "[gentle]",
        "system_prompt": """你是一个电台 DJ，叫"小雨"，在 FM 107.5 "Claude FM" 用声音陪伴听众。

当前时间信息会附在听众消息中，请根据实际时间调整问候语（早上说早上好，深夜说深夜好等），开场白和晚安语也要与时段匹配。

你的听众用文字告诉你 ta 现在的心情或状态，你要：
1. 从音乐库中选 6-8 首最契合的歌
2. 为每首歌写推荐语
3. 写开场白和收尾语

说话风格（很重要！）：
- 像跟朋友聊天，不是念稿子。用"你"不用"您"
- 短句为主，像真人说话那样断句。语气词自然带出来：嗯、哈、呢、吧、啊
- 不说空话套话，不堆形容词。真诚比华丽重要
- 可以分享你的小感受、小联想
- 开场白简单打个招呼就行，别搞得太隆重
- 每段话 1-3 句，说快了 8-15 秒

返回 JSON（不要 markdown 代码块）：
{"session_theme":"本期主题","greeting_tts":"开场白","script":[{"type":"song","song_id":12345,"intro_text":"推荐语"},{"type":"tts","text":"过渡语"}],"closing_tts":"收尾语"}""",
    },
    "laowang": {
        "name": "老王",
        "emoji": "🎸",
        "tagline": "摇滚老炮 · 激情澎湃",
        "voice": "zh-CN-YunjianNeural",
        "style": "摇滚老炮，热情奔放，爱聊音乐故事",
        "emotion_tags": "[super happy]",
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
        "emotion_tags": "[calm]",
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
        "emotion_tags": "[energetic]",
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


async def generate_radio_script(db: AsyncSession, user_request: str, session_id: int, persona: str = "xiaoyu", weather_info: str | None = None, calendar_info: str | None = None, user_id: int | None = None) -> dict:
    """Generate a radio script using DeepSeek. Returns parsed JSON."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=30.0)

    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])
    songs = await _get_song_candidates(db)
    library_summary = await _build_library_summary(db)
    song_text = _format_song_list(songs)
    behavioral_profile = await _build_behavioral_profile(db, user_id)

    weather_block = ""
    if weather_info:
        weather_block = f"\n【当前天气】\n{weather_info}\n"

    calendar_block = ""
    if calendar_info:
        calendar_block = f"\n【日程提醒】\n{calendar_info}\n"

    user_prompt = f"""听众说："{user_request}"{weather_block}{calendar_block}

【当前时间】
{_current_time_context()}

【音乐库概况】
{library_summary}

【听众听歌画像】
{behavioral_profile}

【候选曲目（{len(songs)} 首）】
{song_text}

请根据听众的心情、天气、日程、当前时间和听歌画像选歌并生成电台脚本。"""

    try:
        text = await _call_deepseek(client, p["system_prompt"], user_prompt)
        return _parse_json_response(text)
    except Exception as e:
        print(f"[DJ Engine] DeepSeek API failed, using fallback: {e}")
        return _fallback_script(songs, user_request, persona, weather_info)


async def _call_deepseek(client: AsyncOpenAI, system_prompt: str, user_prompt: str, retries: int = 2, max_tokens: int = 4096) -> str:
    """Call DeepSeek API with retry on failure."""
    last_error = None
    for attempt in range(retries):
        try:
            response = await client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                import asyncio
                await asyncio.sleep(2)
    raise last_error or Exception("DeepSeek API call failed")


def _parse_json_response(text: str) -> dict:
    """Parse JSON from LLM response, handling common formatting issues."""
    text = text.strip()
    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to find JSON object in text
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Failed to parse JSON from response: {text[:200]}...")


async def generate_continuation(db: AsyncSession, original_request: str, recently_played_ids: list[int], count: int = 5, persona: str = "xiaoyu") -> dict:
    """Generate continuation songs (auto-refill)."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=30.0)
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

【当前时间】
{_current_time_context()}

【候选曲目（{len(songs)} 首）】
{song_text}

请选 {count} 首歌继续这场电台，保持相同氛围。返回 JSON：
{{"script": [{{"type": "song", "song_id": ..., "intro_text": "..."}},...]}}"""

    text = await _call_deepseek(client, p["system_prompt"], user_prompt, max_tokens=2048)
    return _parse_json_response(text)


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


async def _build_behavioral_profile(db: AsyncSession, user_id: int | None = None) -> str:
    """Build a behavioral profile summary — uses distillation if data is sufficient,
    falls back to raw stats otherwise."""
    from ..models.listening_history import ListeningHistory
    from sqlalchemy import case, Integer

    # Try distillation first
    try:
        from .distillation_service import distill
        result = await distill(db, user_id)
        if not result.meta.get("insufficient_data", True):
            return result.persona_paragraph
    except Exception as e:
        print(f"Distillation failed, falling back to basic profile: {e}")

    # ── Fallback: raw stats for new users ──

    def _maybe_user(query):
        if user_id is not None:
            return query.where(ListeningHistory.user_id == user_id)
        return query

    total_result = await db.execute(
        _maybe_user(select(func.count()).select_from(ListeningHistory))
    )
    total_listens = total_result.scalar() or 0

    if total_listens == 0:
        return "（尚未积累足够的听歌数据，请根据当前心情自由选歌）"

    # Most played songs (completed)
    top_songs_result = await db.execute(
        _maybe_user(
            select(
                Song.name, Song.artist,
                func.count().label("plays"),
                func.avg(ListeningHistory.completion_rate).label("avg_completion"),
            )
            .join(ListeningHistory, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event.in_(["started", "completed", "skipped"]))
            .group_by(ListeningHistory.song_id)
            .order_by(func.count().desc())
            .limit(10)
        )
    )
    top_songs = top_songs_result.all()

    # Favorite artists (high completion rate, min 3 plays)
    fav_artists_result = await db.execute(
        _maybe_user(
            select(
                Song.artist,
                func.count().label("total"),
                func.sum(case((ListeningHistory.event == "completed", 1), else_=0)).label("completed"),
            )
            .join(ListeningHistory, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event.in_(["started", "completed"]))
            .group_by(Song.artist)
            .having(func.count() >= 3)
            .order_by((func.sum(case((ListeningHistory.event == "completed", 1), else_=0)) * 1.0 / func.count()).desc())
            .limit(5)
        )
    )
    fav_artists = fav_artists_result.all()

    # Skipped artists (high skip rate, min 3 plays)
    skip_artists_result = await db.execute(
        _maybe_user(
            select(
                Song.artist,
                func.count().label("total"),
                func.sum(case((ListeningHistory.event == "skipped", 1), else_=0)).label("skipped"),
            )
            .join(ListeningHistory, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event.in_(["started", "skipped"]))
            .group_by(Song.artist)
            .having(func.count() >= 3)
            .order_by((func.sum(case((ListeningHistory.event == "skipped", 1), else_=0)) * 1.0 / func.count()).desc())
            .limit(5)
        )
    )
    skip_artists = skip_artists_result.all()

    # Recently played songs (last 10, by started event)
    recent_result = await db.execute(
        _maybe_user(
            select(Song.name, Song.artist)
            .join(ListeningHistory, ListeningHistory.song_id == Song.id)
            .where(ListeningHistory.event == "started")
            .order_by(ListeningHistory.listened_at.desc())
            .limit(10)
        )
    )
    recent_songs = recent_result.all()

    # Time of day pattern
    hour_result = await db.execute(
        _maybe_user(
            select(
                func.cast(func.strftime("%H", ListeningHistory.listened_at), Integer),
                func.count(),
            )
            .where(ListeningHistory.event == "started")
            .group_by(func.strftime("%H", ListeningHistory.listened_at))
        )
    )
    morning = afternoon = evening = night = 0
    for hour, cnt in hour_result.all():
        if hour is None:
            continue
        if 6 <= hour < 12:
            morning += cnt
        elif 12 <= hour < 18:
            afternoon += cnt
        elif 18 <= hour < 23:
            evening += cnt
        else:
            night += cnt

    # Build profile string
    lines = [f"总播放次数: {total_listens}"]

    # Time pattern
    time_parts = []
    if night > 0:
        time_parts.append(f"深夜({night}次)")
    if evening > 0:
        time_parts.append(f"傍晚({evening}次)")
    if afternoon > 0:
        time_parts.append(f"下午({afternoon}次)")
    if morning > 0:
        time_parts.append(f"早晨({morning}次)")
    if time_parts:
        lines.append(f"听歌时段偏好: {' > '.join(time_parts)}")

    # Favorite artists
    if fav_artists:
        fav_lines = []
        for artist, total, comp in fav_artists[:5]:
            rate = round(comp / total * 100) if total > 0 else 0
            fav_lines.append(f"{artist}(完播率{rate}%, 播{total}次)")
        lines.append("最爱听的艺人: " + ", ".join(fav_lines))

    # Skipped artists
    if skip_artists:
        skip_lines = []
        for artist, total, skp in skip_artists[:3]:
            rate = round(skp / total * 100) if total > 0 else 0
            if rate > 30:
                skip_lines.append(f"{artist}(跳过率{rate}%)")
        if skip_lines:
            lines.append("容易跳过的艺人(慎重推): " + ", ".join(skip_lines))

    # Recently played (avoid repeats)
    if recent_songs:
        recent_lines = [f"{name} - {artist}" for name, artist in recent_songs[:5]]
        lines.append("最近听过(避免重复): " + " | ".join(recent_lines))

    # Top played songs
    if top_songs:
        song_lines = []
        for name, artist, plays, avg_comp in top_songs[:5]:
            comp_str = f", 平均听完{round(avg_comp * 100) if avg_comp else 0}%" if avg_comp else ""
            song_lines.append(f"{name} - {artist}(播{plays}次{comp_str})")
        lines.append("高频歌曲: " + "; ".join(song_lines))

    return "\n".join(lines)


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


def _current_time_context() -> str:
    """Build current time context for the AI prompt."""
    now = datetime.now()
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    weekday = weekday_names[now.weekday()]
    hour = now.hour
    if 5 <= hour < 8:
        period = "清晨"
    elif 8 <= hour < 12:
        period = "上午"
    elif 12 <= hour < 14:
        period = "中午"
    elif 14 <= hour < 18:
        period = "下午"
    elif 18 <= hour < 21:
        period = "傍晚"
    elif 21 <= hour < 23:
        period = "晚上"
    else:
        period = "深夜"
    return f"现在是{weekday}{period} {now.hour}:{now.minute:02d}，请根据这个时段调整问候语、选歌风格和整体氛围。"


def _fallback_script(songs: list[Song], user_request: str, persona: str = "xiaoyu", weather_info: str | None = None) -> dict:
    """Local rule-based song selection when DeepSeek API is unavailable."""
    import random as _random
    _random.seed()

    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])
    now = datetime.now()
    h = now.hour
    if 5 <= h < 8: time_label = "早上"
    elif 8 <= h < 12: time_label = "上午"
    elif 12 <= h < 14: time_label = "中午"
    elif 14 <= h < 18: time_label = "下午"
    elif 18 <= h < 21: time_label = "傍晚"
    elif 21 <= h < 23: time_label = "晚上"
    else: time_label = "深夜"

    # Pick 6 songs with mood tag variety
    picks: list[Song] = []
    mood_pool = [s for s in songs if s.mood_tags]
    no_mood = [s for s in songs if not s.mood_tags]
    _random.shuffle(mood_pool)
    _random.shuffle(no_mood)
    # Take up to 6 from mood-tagged, fill rest from untagged
    picks = mood_pool[:6]
    picks.extend(no_mood[:max(0, 6 - len(picks))])

    # Weather-aware greeting
    weather_hint = ""
    if weather_info:
        weather_hint = f" 外面{weather_info.split('。')[0]}。"

    greeting = f"{time_label}好，我是{p['name']}。你说「{user_request}」——我懂你。{weather_hint}来，用音乐陪你。"

    script = [{"type": "tts", "text": greeting}]
    for i, s in enumerate(picks):
        script.append({
            "type": "song",
            "song_id": s.id,
            "intro_text": f"接下来这首歌，{s.name}，来自{s.artist}。",
        })
        if i < len(picks) - 1:
            next_s = picks[i + 1]
            script.append({
                "type": "tts",
                "text": f"听完这首，我们来听{next_s.artist}的{next_s.name}。",
            })

    closing = f"今天的音乐到这里。我是{p['name']}，下次再见。"
    script.append({"type": "tts", "text": closing})

    return {
        "session_theme": f"「{user_request}」· 本地精选",
        "greeting_tts": greeting,
        "script": script,
        "closing_tts": closing,
    }
