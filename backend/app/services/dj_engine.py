import json
import random
import logging
from datetime import datetime
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from ..config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL
from ..models.song import Song
from ..models.playlist import Playlist
from ..models.playlist_song import playlist_song_table
from ..models.listening_history import ListeningHistory
from ..services.public_library_service import search_and_attach_songs

logger = logging.getLogger(__name__)
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


async def generate_radio_script(db: AsyncSession, user_request: str, session_id: int, persona: str = "xiaoyu", weather_info: str | None = None, calendar_info: str | None = None, user_id: int | None = None, demo_songs: list[dict] | None = None) -> dict:
    """Generate a radio script using DeepSeek. Returns parsed JSON."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=30.0)

    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])
    artist_names: list[str] = []
    candidate_meta = {
        "library_total": len(demo_songs or []),
        "playable_total": len(demo_songs or []),
        "candidate_count": len(demo_songs or []),
        "tagged_candidates": 0,
        "recently_avoided": 0,
        "playlist_signal_count": 0,
        "strict_artist": False,
        "selected_playlist_names": [],
        "source_breakdown": {"playlist_material": len(demo_songs or []), "search_material": 0, "total_material": len(demo_songs or [])},
        "interpreted_request": {"artists": [], "moods": [], "scenes": [], "energy": "medium"},
        "playback_plan": {"arc": "体验模式", "reason": "先用示例歌曲展示 AI 电台编排方式"},
        "replacement_count": 0,
        "unplayable_count": 0,
    }
    if demo_songs:
        songs = demo_songs
        library_summary = f"体验模式 · 示例曲库: {len(demo_songs)} 首歌曲，{len(set(s['artist'] for s in demo_songs))} 位艺人"
        behavioral_profile = "（体验模式 — 登录后获得个性化推荐）"
    else:
        songs, artist_names, candidate_meta = await _get_song_candidates(db, user_request=user_request, user_id=user_id)
        library_summary = await _build_library_summary(db, user_id)
        behavioral_profile = await _build_behavioral_profile(db, user_id)
    artist_matched_ids = _artist_matched_ids(songs, artist_names)
    song_text = _format_song_list(songs, artist_matched_ids=artist_matched_ids if artist_names else None)

    weather_block = ""
    if weather_info:
        weather_block = f"\n【当前天气】\n{weather_info}\n"

    calendar_block = ""
    if calendar_info:
        calendar_block = f"\n【日程提醒】\n{calendar_info}\n"

    artist_block = ""
    if artist_names:
        if candidate_meta.get("strict_artist"):
            artist_block = f"\n【严格艺人匹配】听众指定只听: {', '.join(artist_names)}。候选歌曲中带 ★艺人匹配 的就是这些艺人的歌（共 {len(artist_matched_ids)} 首）。不要选择其他艺人；如果数量不足 6 首，直接少排几首，并在串词里说明“你的歌单里该艺人可播放歌曲不多”。\n"
        else:
            artist_block = f"\n【艺人匹配】听众指定了艺人: {', '.join(artist_names)}。候选歌曲列表中带 ★艺人匹配 标记的就是这些艺人的歌（共 {len(artist_matched_ids)} 首）。如果匹配歌曲少于 6 首，请先选完这些匹配歌曲，再用相近风格补齐，并在串词里坦诚说明“曲库里的该艺人歌曲不多，已补充相近风格”。\n"

    user_prompt = f"""听众说："{user_request}"{weather_block}{calendar_block}{artist_block}

【当前时间】
{_current_time_context()}

【音乐库概况】
{library_summary}

【听众听歌画像】
{behavioral_profile}

【AI 调度说明】
本次已从用户全量歌单中预筛候选：曲库 {candidate_meta.get("library_total", 0)} 首，可播放 {candidate_meta.get("playable_total", 0)} 首，给你精排 {candidate_meta.get("candidate_count", len(songs))} 首。最近播放过的歌已降权；歌单名和歌单描述也参与了匹配。

【候选曲目（{len(songs)} 首）】
{song_text}

请根据听众的心情、天气、日程、当前时间和听歌画像选歌并生成电台脚本。"""

    try:
        text = await _call_deepseek(client, p["system_prompt"], user_prompt)
        script = _enforce_artist_selection(_parse_json_response(text), songs, artist_names)
        return _attach_ai_intent(script, user_request, artist_names, artist_matched_ids, candidate_meta)
    except Exception as e:
        logger.warning("DeepSeek API failed, using fallback: %s", e)
        script = _enforce_artist_selection(_fallback_script(songs, user_request, persona, weather_info, artist_names=artist_names), songs, artist_names)
        return _attach_ai_intent(script, user_request, artist_names, artist_matched_ids, candidate_meta)


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

    parsed = None
    # Try direct parse
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in text
    if parsed is None:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

    if parsed is None:
        raise ValueError(f"Failed to parse JSON from response: {text[:200]}...")

    # Validate required fields
    if "script" not in parsed:
        raise ValueError(f"JSON response missing 'script' field: {text[:200]}...")
    if not isinstance(parsed["script"], list):
        raise ValueError(f"JSON 'script' field must be an array: {text[:200]}...")

    return parsed


async def generate_adjustment(db: AsyncSession, original_request: str, new_mood: str, current_theme: str, recently_played_ids: list[int], count: int = 5, persona: str = "xiaoyu", user_id: int | None = None) -> dict:
    """Generate a transition script when the user changes mood mid-session."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=30.0)
    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])

    songs, _, _ = await _get_song_candidates(db, exclude_ids=recently_played_ids, user_id=user_id)
    song_text = _format_song_list(songs)

    system_prompt = f"""{p['system_prompt']}

当前电台主题是「{current_theme}」，听众想切换心情。你需要写一段自然的过渡串词（1-2句），先承接当前氛围，再自然地转向新心情。不要突兀。

返回 JSON（不要 markdown 代码块）：
{{"transition_tts":"过渡串词","script":[{{"type":"song","song_id":...,"intro_text":"..."}},...]}}"""

    user_prompt = f"""听众原始请求："{original_request}"
听众现在说：「换心情：{new_mood}」

【当前时间】
{_current_time_context()}

【候选曲目（{len(songs)} 首）】
{song_text}

请选 {count} 首歌匹配新心情，先写一段过渡串词承接上下文再切换风格。"""

    try:
        text = await _call_deepseek(client, system_prompt, user_prompt, max_tokens=2048)
        return _parse_json_response(text)
    except Exception as e:
        logger.warning("DeepSeek adjustment failed, using fallback: %s", e)
        picks = songs[:count] if len(songs) >= count else songs
        script = []
        for i, s in enumerate(picks):
            sid = s.id if hasattr(s, 'id') else s.get('id', i+1)
            name = s.name if hasattr(s, 'name') else s.get('name', '?')
            artist = s.artist if hasattr(s, 'artist') else s.get('artist', '?')
            script.append({
                "type": "song",
                "song_id": sid,
                "intro_text": f"换种心情，来听{artist}的{name}。",
            })
        return {
            "transition_tts": f"好，换个心情。接下来感受一下{new_mood}的感觉。",
            "script": script,
        }


async def generate_continuation(db: AsyncSession, original_request: str, recently_played_ids: list[int], count: int = 5, persona: str = "xiaoyu", user_id: int | None = None) -> dict:
    """Generate continuation songs (auto-refill)."""
    client = AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL, timeout=30.0)
    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])

    songs, _, _ = await _get_song_candidates(db, exclude_ids=recently_played_ids, user_id=user_id)

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


def _user_library_query(user_id: int | None):
    query = select(Song)
    if user_id is not None:
        query = (
            query
            .join(playlist_song_table, playlist_song_table.c.song_id == Song.id)
            .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
            .where(Playlist.user_id == user_id)
            .distinct()
        )
    return query


async def _get_song_candidates(db: AsyncSession, user_request: str = "", limit: int = 140, exclude_ids: list[int] | None = None, user_id: int | None = None):
    mood_keywords = _extract_mood_keywords(user_request)
    strict_artist = _is_strict_artist_request(user_request)

    library_query = _user_library_query(user_id)
    if exclude_ids:
        library_query = library_query.where(Song.id.notin_(exclude_ids))
    all_library_songs = (await db.execute(library_query)).scalars().all()

    artist_names = _extract_artist_names(user_request, all_library_songs)
    recent_song_ids = await _recent_song_ids(db, user_id)
    playlist_context = await _song_playlist_context(db, user_id)
    playlist_names = await _matching_playlist_names(db, user_id, user_request, mood_keywords)
    excluded = set(exclude_ids or [])

    query = (
        _user_library_query(user_id)
        .where(
            or_(Song.has_playable_url == True, Song.last_url_fetch == None),
        )
    )
    if excluded:
        query = query.where(Song.id.notin_(excluded))

    all_candidates = (await db.execute(query)).scalars().all()
    external_search_count = 0

    if artist_names:
        artist_match_ids = {s.id for s in all_candidates if any(a in (s.artist or "") for a in artist_names)}
        if user_id and len(artist_match_ids) < 3:
            for name in artist_names[:2]:
                fetched = await search_and_attach_songs(db, user_id, name, limit=12)
                external_search_count += len(fetched)
            all_library_songs = (await db.execute(library_query)).scalars().all()
            playlist_context = await _song_playlist_context(db, user_id)
            playlist_names = await _matching_playlist_names(db, user_id, user_request, mood_keywords)
            all_candidates = (await db.execute(query)).scalars().all()
            artist_match_ids = {s.id for s in all_candidates if any(a in (s.artist or "") for a in artist_names)}
        artist_matches = [s for s in all_candidates if s.id in artist_match_ids]
        other_songs = [s for s in all_candidates if s.id not in artist_match_ids]
        artist_matches = _rank_song_candidates(artist_matches, user_request, mood_keywords, recent_song_ids, playlist_context)
        other_songs = [] if strict_artist else _select_diverse_candidates(other_songs, user_request, mood_keywords, recent_song_ids, playlist_context, max(0, limit - len(artist_matches[:limit])))
        songs = artist_matches[:limit]
        if len(songs) < limit:
            songs.extend(other_songs[:limit - len(songs)])
    else:
        if user_id and len(all_candidates) < 12 and user_request.strip():
            fetched = await search_and_attach_songs(db, user_id, user_request, limit=12)
            external_search_count += len(fetched)
            all_library_songs = (await db.execute(library_query)).scalars().all()
            playlist_context = await _song_playlist_context(db, user_id)
            playlist_names = await _matching_playlist_names(db, user_id, user_request, mood_keywords)
            all_candidates = (await db.execute(query)).scalars().all()
        songs = _select_diverse_candidates(all_candidates, user_request, mood_keywords, recent_song_ids, playlist_context, limit)

    if len(songs) < limit and not (artist_names and strict_artist):
        existing_ids = {s.id for s in songs}
        existing_ids.update(excluded)
        extra_query = (
            _user_library_query(user_id)
            .where(
                Song.id.notin_(existing_ids),
                or_(Song.has_playable_url == True, Song.last_url_fetch == None),
            )
            .limit(limit - len(songs))
        )
        extra = (await db.execute(extra_query)).scalars().all()
        songs.extend(_select_diverse_candidates(extra, user_request, mood_keywords, recent_song_ids, playlist_context, limit - len(songs)))

    candidate_meta = {
        "library_total": len(all_library_songs),
        "playable_total": len(all_candidates),
        "candidate_count": len(songs),
        "tagged_candidates": len([s for s in songs if s.mood_tags]),
        "recently_avoided": len(recent_song_ids),
        "playlist_signal_count": len(playlist_names),
        "strict_artist": bool(artist_names and strict_artist),
        "selected_playlist_names": playlist_names[:3],
        "external_search_count": external_search_count,
        "source_breakdown": await _source_breakdown(db, user_id),
        "interpreted_request": _interpreted_request(user_request, artist_names, mood_keywords),
        "playback_plan": _playback_plan(user_request, artist_names, mood_keywords),
        "replacement_count": 0,
        "unplayable_count": len([s for s in all_library_songs if getattr(s, "has_playable_url", False) is False and getattr(s, "last_url_fetch", None) is not None]),
    }

    logger.info(
        "[DJ] candidates user_id=%s library=%s playable=%s selected=%s tagged_selected=%s request=%s",
        user_id,
        candidate_meta["library_total"],
        candidate_meta["playable_total"],
        candidate_meta["candidate_count"],
        candidate_meta["tagged_candidates"],
        user_request[:40],
    )
    return songs, artist_names, candidate_meta


async def _source_breakdown(db: AsyncSession, user_id: int | None) -> dict:
    if user_id is None:
        return {"playlist_material": 0, "search_material": 0, "total_material": 0}
    result = await db.execute(
        select(Playlist.netease_playlist_id, func.count(func.distinct(playlist_song_table.c.song_id)))
        .select_from(playlist_song_table)
        .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
        .where(Playlist.user_id == user_id)
        .group_by(Playlist.netease_playlist_id)
    )
    playlist_material = 0
    search_material = 0
    for netease_playlist_id, count in result.all():
        if netease_playlist_id and netease_playlist_id <= -900000000:
            search_material += count
        else:
            playlist_material += count
    return {
        "playlist_material": playlist_material,
        "search_material": search_material,
        "total_material": playlist_material + search_material,
    }


def _interpreted_request(user_request: str, artist_names: list[str], mood_keywords: list[str]) -> dict:
    scenes = [word for word in ["开车", "通勤", "加班", "工作", "下雨", "深夜", "睡前", "运动", "周末"] if word in user_request]
    energy = "high" if any(word in user_request for word in ["燃", "运动", "节奏", "嗨", "提神"]) else "low" if any(word in user_request for word in ["安静", "睡前", "不吵", "低能量", "治愈"]) else "medium"
    return {
        "artists": artist_names,
        "moods": mood_keywords,
        "scenes": scenes,
        "energy": energy,
    }


def _playback_plan(user_request: str, artist_names: list[str], mood_keywords: list[str]) -> dict:
    if any(word in user_request for word in ["深夜", "睡前", "安静", "不吵"]):
        return {"arc": "低能量开场 → 轻微升温 → 收回到安静", "reason": "你的描述更适合不打扰的陪伴式编排"}
    if any(word in user_request for word in ["运动", "燃", "提神", "开车"]):
        return {"arc": "快速进入节奏 → 中段保持能量 → 结尾留一点余温", "reason": "场景需要更稳定的推进感"}
    if artist_names:
        return {"arc": "点名艺人优先 → 相近风格补齐 → DJ 解释缺口", "reason": "先满足明确点名，再用相近素材保证节目完整"}
    if mood_keywords:
        return {"arc": "情绪贴合优先 → 风格略扩展 → 避免重复", "reason": "以你的心情词作为主线，兼顾新鲜度"}
    return {"arc": "画像召回 → 多样化编排 → 逐步校准", "reason": "指令较自由，先按你的曲库画像试探"}


async def _recent_song_ids(db: AsyncSession, user_id: int | None, limit: int = 80) -> set[int]:
    if user_id is None:
        return set()
    result = await db.execute(
        select(ListeningHistory.song_id)
        .where(
            ListeningHistory.user_id == user_id,
            ListeningHistory.song_id != None,
            ListeningHistory.event.in_(["started", "completed", "skipped"]),
        )
        .order_by(ListeningHistory.listened_at.desc())
        .limit(limit)
    )
    return {row[0] for row in result.all() if row[0]}


async def _song_playlist_context(db: AsyncSession, user_id: int | None) -> dict[int, str]:
    if user_id is None:
        return {}
    result = await db.execute(
        select(playlist_song_table.c.song_id, Playlist.name, Playlist.description)
        .select_from(playlist_song_table)
        .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
        .where(Playlist.user_id == user_id)
    )
    context: dict[int, list[str]] = {}
    for song_id, name, desc in result.all():
        parts = [name or "", desc or ""]
        context.setdefault(song_id, []).append(" ".join(p for p in parts if p))
    return {song_id: " ".join(parts) for song_id, parts in context.items()}


async def _matching_playlist_names(db: AsyncSession, user_id: int | None, user_request: str, mood_keywords: list[str]) -> list[str]:
    if user_id is None:
        return []
    terms = set(_request_terms(user_request)) | set(mood_keywords)
    if not terms:
        return []
    result = await db.execute(
        select(Playlist.name, Playlist.description)
        .where(Playlist.user_id == user_id)
    )
    matches = []
    for name, desc in result.all():
        text = f"{name or ''} {desc or ''}".lower()
        if any(term.lower() in text for term in terms):
            matches.append(name or "未命名歌单")
    return matches[:5]


def _select_diverse_candidates(songs: list, user_request: str, mood_keywords: list[str], recent_song_ids: set[int], playlist_context: dict[int, str], limit: int) -> list:
    if limit <= 0 or not songs:
        return []

    ranked = _rank_song_candidates(songs, user_request, mood_keywords, recent_song_ids, playlist_context)
    high_signal = [s for s in ranked if _song_match_score(s, user_request, mood_keywords, recent_song_ids, playlist_context) >= 20]
    remaining = [s for s in ranked if s not in high_signal]
    random.shuffle(remaining)

    selected: list = []
    artist_counts: dict[str, int] = {}

    def take(pool: list, artist_cap: int):
        for song in pool:
            if len(selected) >= limit:
                return
            if song in selected:
                continue
            artist_key = (song.artist or "未知").split(" / ")[0]
            if artist_counts.get(artist_key, 0) >= artist_cap:
                continue
            selected.append(song)
            artist_counts[artist_key] = artist_counts.get(artist_key, 0) + 1

    take(high_signal, 3)
    take(remaining, 1)
    if len(selected) < limit:
        take(ranked, 3)
    return selected[:limit]


def _rank_song_candidates(songs: list, user_request: str, mood_keywords: list[str], recent_song_ids: set[int], playlist_context: dict[int, str]) -> list:
    jittered = list(songs)
    random.shuffle(jittered)
    jittered.sort(key=lambda s: _song_match_score(s, user_request, mood_keywords, recent_song_ids, playlist_context), reverse=True)
    return jittered


def _song_match_score(song, user_request: str, mood_keywords: list[str], recent_song_ids: set[int], playlist_context: dict[int, str]) -> int:
    text = " ".join([
        song.name or "",
        song.artist or "",
        song.album or "",
        song.genre or "",
        song.mood_tags or "",
        playlist_context.get(song.id, ""),
    ]).lower()
    score = 0
    for kw in mood_keywords:
        if kw.lower() in text:
            score += 35
    for term in _request_terms(user_request):
        if term in text:
            score += 18
    if song.mood_tags:
        score += 8
    if song.genre:
        score += 4
    score += min(20, (song.popularity or 0) // 5)
    score += min(16, (song.like_count or 0) * 4)
    score -= min(18, (song.dislike_count or 0) * 6)
    if song.id in recent_song_ids:
        score -= 42
    return score


def _request_terms(user_request: str) -> list[str]:
    import re

    stop_words = {
        "来点", "来首", "播放", "听点", "歌曲", "音乐", "一首", "几首", "适合",
        "不想", "想听", "给我", "一点", "一些", "这个", "那个", "现在",
    }
    terms = set(_extract_mood_keywords(user_request))
    for token in re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fa5]{2,6}", user_request.lower()):
        if token not in stop_words and len(token) >= 2:
            terms.add(token)
    return list(terms)


def _is_strict_artist_request(user_request: str) -> bool:
    strict_words = ["只听", "只想听", "不要其他", "不想听其他", "别放其他", "只放", "就听", "锁定艺人"]
    return any(word in user_request for word in strict_words)


def _extract_mood_keywords(user_request: str) -> list[str]:
    """Extract mood/style keywords from user's natural language request.
    Matches against known mood tags and genre names in Chinese."""
    KNOWN_KEYWORDS = [
        "摇滚", "流行", "电子", "古典", "爵士", "民谣", "说唱", "嘻哈", "R&B", "蓝调", "金属", "朋克", "雷鬼",
        "轻松", "温暖", "治愈", "安静", "钢琴", "轻快", "元气", "慵懒", "沙发", "氛围", "迷幻", "深沉", "有力",
        "清新", "温柔", "浪漫", "伤感", "快乐", "活力", "运动", "专注", "睡眠", "瑜伽", "咖啡", "旅行", "开车",
        "舞曲", "电音", "后摇", "独立", "另类", "世界音乐", "原声", "电影原声", "古风", "国风", "纯音乐", "轻音乐",
        "节奏", "慢摇", "快节奏", "慢节奏", "激情", "平静", "减压", "放松", "兴奋", "忧郁", "思念", "怀旧",
    ]
    keywords = []
    for kw in KNOWN_KEYWORDS:
        if kw in user_request:
            keywords.append(kw)
    return keywords


def _extract_artist_names(user_request: str, songs: list) -> list[str]:
    """Extract artist names from user request by substring-matching against known artists in the library."""
    # Collect all unique artist names from the candidate pool
    known_artists: set[str] = set()
    for s in songs:
        if s.artist:
            for name in s.artist.split(" / "):
                name = name.strip()
                if len(name) >= 2:
                    known_artists.add(name)

    # Match against user request — longer names first to avoid partial matches
    matched = []
    for artist in sorted(known_artists, key=lambda a: -len(a)):
        if artist in user_request:
            matched.append(artist)
    if matched:
        return matched

    hint = _extract_requested_artist_hint(user_request)
    return [hint] if hint else []


def _extract_requested_artist_hint(user_request: str) -> str | None:
    import re

    non_artist_words = set(_extract_mood_keywords(user_request)) | {
        "摇滚", "流行", "电子", "古典", "爵士", "民谣", "说唱", "嘻哈", "蓝调",
        "中文", "英文", "日文", "韩文", "粤语", "国语", "轻音乐", "纯音乐",
    }
    patterns = [
        r"(?:来|放|播|听)(?:一?首|点|些|几首)?(?P<artist>[\u4e00-\u9fa5A-Za-z0-9·.\s]{2,24})的歌",
        r"(?:来|放|播|听)(?:一?首|点|些|几首)?(?P<artist>[\u4e00-\u9fa5A-Za-z0-9·.\s]{2,16})(?:，|,|。|\.|；|;|\s)+(?:适合|要|别|少|多|不够|优先|晚上|早上|深夜|开车|通勤|加班|运动)",
        r"(?:来|放|播|听)(?:一?首|点|些|几首)?(?P<artist>[\u4e00-\u9fa5A-Za-z0-9·.\s]{2,16})$",
    ]
    stop_words = {"歌", "音乐", "歌曲", "好歌", "电台", "推荐", "来首", "放点", "听点"}
    for pattern in patterns:
        m = re.search(pattern, user_request.strip())
        if not m:
            continue
        artist = m.group("artist").strip(" ，。,.!！?？")
        artist = re.sub(r"^(一首|点|些|几首)", "", artist).strip()
        artist = re.sub(r"(适合|要|别|少|多|不够|优先|晚上|早上|深夜|开车|通勤|加班|运动).*$", "", artist).strip()
        if 2 <= len(artist) <= 24 and artist not in stop_words and artist not in non_artist_words:
            return artist
    return None


def _artist_matched_ids(songs: list, artist_names: list[str]) -> set[int]:
    if not artist_names:
        return set()
    return {
        s.id for s in songs
        if hasattr(s, "id") and any(a in (s.artist or "") for a in artist_names)
    }


def _enforce_artist_selection(script: dict, songs: list, artist_names: list[str]) -> dict:
    artist_ids = _artist_matched_ids(songs, artist_names)
    if not artist_ids:
        return script

    selected_ids = [
        item.get("song_id") for item in script.get("script", [])
        if item.get("type") == "song" and item.get("song_id") is not None
    ]
    missing_ids = [
        s.id for s in songs
        if hasattr(s, "id") and s.id in artist_ids and s.id not in selected_ids
    ]
    if not missing_ids:
        return script

    song_map = {s.id: s for s in songs if hasattr(s, "id")}
    inserts = []
    selected_artist_count = len([sid for sid in selected_ids if sid in artist_ids])
    target_artist_count = min(6, len(artist_ids))
    for song_id in missing_ids[:max(0, target_artist_count - selected_artist_count)]:
        song = song_map.get(song_id)
        if not song:
            continue
        inserts.append({
            "type": "song",
            "song_id": song.id,
            "intro_text": f"你点到的{song.artist}，我从你的歌单里找到了这首{song.name}。",
        })
    if inserts:
        script["script"] = inserts + script.get("script", [])
    return script


def _attach_ai_intent(script: dict, user_request: str, artist_names: list[str], artist_matched_ids: set[int], candidate_meta: dict | None = None) -> dict:
    candidate_meta = candidate_meta or {}
    if not artist_names:
        script["ai_intent"] = {
            "raw_request": user_request,
            "detected_artists": [],
            "match_count": 0,
            "fallback_count": 0,
            "coverage": "none",
            "strategy": "心情画像优先",
            "signals": _intent_signals(user_request, []),
            "confidence": "medium",
            "candidate_meta": candidate_meta,
            "message": "AI 将根据你的心情和听歌画像选歌。",
        }
        return script

    selected_song_ids = [
        item.get("song_id") for item in script.get("script", [])
        if item.get("type") == "song" and item.get("song_id") is not None
    ]
    artist_match_count = len(artist_matched_ids)
    selected_artist_count = len([song_id for song_id in selected_song_ids if song_id in artist_matched_ids])
    fallback_count = 0 if candidate_meta.get("strict_artist") else max(0, len(selected_song_ids) - selected_artist_count)
    if candidate_meta.get("strict_artist") and artist_match_count > 0:
        coverage = "enough" if artist_match_count >= 6 else "partial"
        confidence = "high" if artist_match_count >= 3 else "medium"
        strategy = "严格艺人锁定"
        message = f"已按你的要求锁定「{'、'.join(artist_names)}」，只从该艺人的可播放歌曲中编排。"
    elif artist_match_count >= 6:
        coverage = "enough"
        confidence = "high"
        strategy = "艺人优先"
        message = f"已识别艺人「{'、'.join(artist_names)}」，从你的歌单库中找到 {artist_match_count} 首可选歌曲。"
    elif artist_match_count > 0:
        coverage = "partial"
        confidence = "medium"
        strategy = "艺人优先 + 风格补齐"
        message = f"已识别艺人「{'、'.join(artist_names)}」，你的歌单库中找到 {artist_match_count} 首，已用相近风格补齐。"
    else:
        coverage = "missing"
        confidence = "low"
        strategy = "相近风格兜底"
        message = f"已识别艺人「{'、'.join(artist_names)}」，但你的歌单库里暂时没有可播放歌曲，已按相近风格推荐。"

    script["ai_intent"] = {
        "raw_request": user_request,
        "detected_artists": artist_names,
        "match_count": artist_match_count,
        "fallback_count": fallback_count,
        "coverage": coverage,
        "strategy": strategy,
        "signals": _intent_signals(user_request, artist_names),
        "confidence": confidence,
        "candidate_meta": candidate_meta,
        "message": message,
    }
    return script


def _intent_signals(user_request: str, artist_names: list[str]) -> list[str]:
    signals = []
    if artist_names:
        signals.append("艺人")
    if _extract_mood_keywords(user_request):
        signals.append("情绪")
    scene_words = ["开车", "加班", "运动", "睡觉", "通勤", "学习", "工作", "下雨", "深夜", "早晨", "周末"]
    if any(word in user_request for word in scene_words):
        signals.append("场景")
    if not signals:
        signals.append("自由点播")
    return signals


async def _build_library_summary(db: AsyncSession, user_id: int | None = None) -> str:
    """Build a text summary of the music library."""
    if user_id is not None:
        total_query = (
            select(func.count(func.distinct(playlist_song_table.c.song_id)))
            .select_from(playlist_song_table)
            .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
            .where(Playlist.user_id == user_id)
        )
    else:
        total_query = select(func.count()).select_from(Song)

    total_result = await db.execute(total_query)
    total = total_result.scalar() or 0

    genre_result = await db.execute(
        _user_library_query(user_id)
        .with_only_columns(Song.genre, func.count(func.distinct(Song.id)))
        .where(Song.genre != None)
        .group_by(Song.genre)
        .order_by(func.count(func.distinct(Song.id)).desc())
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
        logger.warning("Distillation failed, falling back to basic profile: %s", e)

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

    # Liked / disliked songs (user explicit feedback)
    liked_artists_result = await db.execute(
        select(Song.artist, func.sum(Song.like_count))
        .where(Song.like_count > 0, Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.sum(Song.like_count).desc())
        .limit(5)
    )
    liked = [(a, c) for a, c in liked_artists_result.all() if c]
    if liked:
        lines.append("用户点赞的艺人(优先推荐): " + ", ".join(f"{a}({c}赞)" for a, c in liked))

    disliked_artists_result = await db.execute(
        select(Song.artist, func.sum(Song.dislike_count))
        .where(Song.dislike_count > 0, Song.artist != None)
        .group_by(Song.artist)
        .order_by(func.sum(Song.dislike_count).desc())
        .limit(3)
    )
    disliked = [(a, c) for a, c in disliked_artists_result.all() if c]
    if disliked:
        lines.append("用户不喜欢的艺人(避免推荐): " + ", ".join(f"{a}({c}踩)" for a, c in disliked))

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


def _format_song_list(songs, artist_matched_ids: set[int] | None = None) -> str:
    """Format songs for AI prompt — includes genre and bpm for better matching."""
    lines = []
    for i, s in enumerate(songs):
        if isinstance(s, dict):
            lines.append(f"[id:{i+1}] {s['name']} - {s['artist']} | 专辑:{s.get('album', '?')}")
        else:
            tags = s.mood_tags or ""
            genre = s.genre or ""
            bpm = f"bpm:{s.bpm}" if s.bpm else ""
            dur = f"{s.duration_ms // 60000}:{(s.duration_ms % 60000) // 1000:02d}" if s.duration_ms else "?"
            matched = "★艺人匹配" if artist_matched_ids and s.id in artist_matched_ids else ""
            parts = [
                f"[id:{s.id}] {s.name} - {s.artist} {matched}",
                f"风格:{genre}" if genre else "",
                f"心情:{tags}" if tags else "",
                bpm,
                f"时长:{dur}",
            ]
            lines.append(" | ".join(p for p in parts if p))
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


def _fallback_script(songs, user_request: str, persona: str = "xiaoyu", weather_info: str | None = None, artist_names: list[str] | None = None) -> dict:
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

    is_demo = songs and isinstance(songs[0], dict) if songs else False

    picks = []
    if is_demo:
        _random.shuffle(songs)
        picks = songs[:6]
    else:
        mood_pool = [s for s in songs if s.mood_tags]
        no_mood = [s for s in songs if not s.mood_tags]
        artist_pool = [
            s for s in songs
            if artist_names and any(name in (s.artist or "") for name in artist_names)
        ]
        artist_ids = {s.id for s in artist_pool}
        mood_pool = [s for s in mood_pool if s.id not in artist_ids]
        no_mood = [s for s in no_mood if s.id not in artist_ids]
        _random.shuffle(mood_pool)
        _random.shuffle(no_mood)
        picks = artist_pool[:6]
        picks.extend(mood_pool[:max(0, 6 - len(picks))])
        picks.extend(no_mood[:max(0, 6 - len(picks))])

    # Weather-aware greeting
    weather_hint = ""
    if weather_info:
        weather_hint = f" 外面{weather_info.split('。')[0]}。"

    # B7: ensure we have at least some songs
    if not picks and songs:
        import random as _r
        picks = _r.sample(songs, min(6, len(songs)))
    if not picks:
        return {
            "session_theme": f"「{user_request}」· 无可用歌曲",
            "greeting_tts": f"抱歉，{time_label}好。目前歌单里还没有歌曲，请先导入歌单后再试。",
            "script": [],
            "closing_tts": "",
        }

    greeting = f"{time_label}好，我是{p['name']}。你说「{user_request}」——我懂你。{weather_hint}来，用音乐陪你。"

    # script array contains only songs and TTS bridges (no greeting/closing)
    script = []
    for i, s in enumerate(picks):
        song_id = s.id if not is_demo else (i + 1)
        song_name = s.name if not is_demo else s["name"]
        song_artist = s.artist if not is_demo else s["artist"]
        script.append({
            "type": "song",
            "song_id": song_id,
            "intro_text": f"接下来这首歌，{song_name}，来自{song_artist}。",
        })
        if i < len(picks) - 1:
            next_s = picks[i + 1]
            next_name = next_s.name if not is_demo else next_s["name"]
            next_artist = next_s.artist if not is_demo else next_s["artist"]
            script.append({
                "type": "tts",
                "text": f"听完这首，我们来听{next_artist}的{next_name}。",
            })

    closing = f"今天的音乐到这里。我是{p['name']}，下次再见。"

    return {
        "session_theme": f"「{user_request}」· 本地精选",
        "greeting_tts": greeting,
        "script": script,
        "closing_tts": closing,
    }
