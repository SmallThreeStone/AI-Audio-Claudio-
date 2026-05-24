"""
Music distillation engine — transforms raw listening history into
cross-dimension insights for AI prompt injection.

Five analyzers:
  1. NetEase affinity — all-time play counts from imported NetEase history
  2. Time affinity — per-song time-slot preference (radio data)
  3. Weather affinity — per-weather-condition song/artist patterns (radio data)
  4. Scene affinity — per-mood-keyword genre/BPM preferences (radio data)
  5. Cross insights — multi-dimension correlations

Fuses two data sources:
  - NetEase: volume signal (play counts, artist dominance)
  - Radio: context signal (time/weather/scene correlations)

Design: on-the-fly computation, no materialization. Data volume is small
(personal project), all queries run in <100ms on SQLite.
"""

from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from ..models.listening_history import ListeningHistory
from ..models.queue_item import QueueItem
from ..models.dj_session import DJSession
from ..models.song import Song
from ..models.netease_listening import NeteaseListening

# ---------------------------------------------------------------------------
# Weather keyword classifier
# ---------------------------------------------------------------------------

WEATHER_CATEGORIES: dict[str, list[str]] = {
    "雨天": ["雨", "下雨", "阵雨", "雷雨", "细雨", "暴雨", "drizzle", "rain", "thunderstorm"],
    "晴天": ["晴", "晴朗", "clear", "sunny"],
    "阴天": ["阴", "多云", "clouds", "cloudy", "overcast"],
    "雪天": ["雪", "snow"],
    "雾天": ["雾", "霾", "mist", "fog", "haze"],
}


def _classify_weather(summary: str | None) -> list[str]:
    if not summary:
        return []
    cats = []
    for cat, keywords in WEATHER_CATEGORIES.items():
        for kw in keywords:
            if kw in summary:
                cats.append(cat)
                break
    return cats


# ---------------------------------------------------------------------------
# Scene / mood keyword matching
# ---------------------------------------------------------------------------

SCENE_KEYWORDS: list[str] = [
    "加班", "工作", "学习", "运动", "跑步", "健身", "放松",
    "睡觉", "失眠", "下雨", "雨天", "下雪", "开心", "难过",
    "治愈", "安静", "专注", "起床", "通勤", "开车", "做饭",
    "阅读", "旅行", "派对", "聚会", "失恋", "疲惫", "emo",
    "周末", "深夜", "清晨", "午后",
]


def _match_scenes(user_request: str | None) -> list[str]:
    if not user_request:
        return []
    return [kw for kw in SCENE_KEYWORDS if kw in user_request]


# ---------------------------------------------------------------------------
# Time slot bucketing
# ---------------------------------------------------------------------------

def _hour_to_slot(hour: int) -> str:
    if 5 <= hour < 8:
        return "清晨"
    elif 8 <= hour < 12:
        return "上午"
    elif 12 <= hour < 14:
        return "中午"
    elif 14 <= hour < 18:
        return "下午"
    elif 18 <= hour < 21:
        return "傍晚"
    elif 21 <= hour < 23:
        return "晚上"
    else:
        return "深夜"


# ---------------------------------------------------------------------------
# Output dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SongRef:
    name: str
    artist: str
    play_count: int
    completion_rate: float = 0.0


@dataclass
class TimeAffinityEntry:
    song_name: str
    artist: str
    dominant_slot: str
    slot_percentage: float
    total_plays: int


@dataclass
class WeatherAffinityEntry:
    weather_category: str
    top_songs: list[SongRef]
    top_artists: list[str]
    dominant_genre: str | None
    insight: str
    total_plays: int


@dataclass
class SceneAffinityEntry:
    keyword: str
    preferred_genres: list[tuple[str, int]]
    avg_bpm: float | None
    top_mood_tags: list[str]
    top_artists: list[str]
    insight: str
    sample_count: int


@dataclass
class CrossInsight:
    text: str
    confidence: str  # "high" (>20 samples), "medium" (>10), "low" (<=10)
    dimensions: list[str]


@dataclass
class NeteaseAffinity:
    top_artists: list[tuple[str, int]]  # (artist_name, total_play_count)
    top_songs: list[tuple[str, str, int]]  # (name, artist, play_count)
    total_songs_tracked: int
    total_plays: int


@dataclass
class DistillationResult:
    netease_affinity: NeteaseAffinity | None = None
    time_affinity: list[TimeAffinityEntry] = field(default_factory=list)
    weather_affinity: list[WeatherAffinityEntry] = field(default_factory=list)
    scene_affinity: list[SceneAffinityEntry] = field(default_factory=list)
    cross_insights: list[CrossInsight] = field(default_factory=list)
    persona_paragraph: str = ""
    meta: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def distill(db: AsyncSession) -> DistillationResult:
    total = await db.scalar(select(func.count()).select_from(ListeningHistory))
    total_listens = total or 0

    if total_listens < 10:
        return DistillationResult(
            meta={"total_listens": total_listens, "insufficient_data": True},
        )

    ne_aff = await _compute_netease_affinity(db)
    time_aff = await _compute_time_affinity(db)
    weather_aff = await _compute_weather_affinity(db)
    scene_aff = await _compute_scene_affinity(db)
    cross = _compute_cross_insights(time_aff, weather_aff, scene_aff)
    paragraph = _build_persona_paragraph(ne_aff, time_aff, weather_aff, scene_aff, cross, total_listens)

    return DistillationResult(
        netease_affinity=ne_aff,
        time_affinity=time_aff,
        weather_affinity=weather_aff,
        scene_affinity=scene_aff,
        cross_insights=cross,
        persona_paragraph=paragraph,
        meta={"total_listens": total_listens, "insufficient_data": False},
    )


# ---------------------------------------------------------------------------
# Analyzer 0: NetEase affinity (volume signal)
# ---------------------------------------------------------------------------


async def _compute_netease_affinity(db: AsyncSession) -> NeteaseAffinity:
    """Aggregate all-time NetEase listening stats by artist and song."""
    rows = await db.execute(
        select(
            Song.name,
            Song.artist,
            NeteaseListening.play_count,
        )
        .join(Song, NeteaseListening.song_id == Song.id)
        .order_by(NeteaseListening.play_count.desc())
    )
    all_rows = rows.all()

    # Top songs (by play count)
    top_songs: list[tuple[str, str, int]] = []
    artist_plays: dict[str, int] = {}
    for name, artist, count in all_rows:
        top_songs.append((name or "未知", artist or "未知", count))
        artist_plays[artist or "未知"] = artist_plays.get(artist or "未知", 0) + count

    # Top artists
    sorted_artists = sorted(artist_plays.items(), key=lambda x: x[1], reverse=True)

    return NeteaseAffinity(
        top_artists=sorted_artists[:10],
        top_songs=top_songs[:20],
        total_songs_tracked=len(all_rows),
        total_plays=sum(c for _, _, c in all_rows),
    )


# ---------------------------------------------------------------------------
# Analyzer 1: Time affinity
# ---------------------------------------------------------------------------


async def _compute_time_affinity(db: AsyncSession) -> list[TimeAffinityEntry]:
    rows = await db.execute(
        select(
            ListeningHistory.song_id,
            ListeningHistory.listened_at,
            Song.name,
            Song.artist,
        )
        .join(Song, ListeningHistory.song_id == Song.id)
        .where(ListeningHistory.event == "started", ListeningHistory.song_id.isnot(None))
    )
    events = rows.all()

    # Aggregate: {(song_name, artist, song_id): {slot: count}}
    song_slots: dict[tuple, dict[str, int]] = {}
    for song_id, listened_at, name, artist in events:
        if not listened_at:
            continue
        slot = _hour_to_slot(listened_at.hour)
        key = (name or "未知", artist or "未知", song_id)
        if key not in song_slots:
            song_slots[key] = {}
        song_slots[key][slot] = song_slots[key].get(slot, 0) + 1

    results: list[TimeAffinityEntry] = []
    for (name, artist, _), slots in song_slots.items():
        total = sum(slots.values())
        if total < 3:
            continue
        dominant = max(slots, key=lambda s: slots[s])
        pct = slots[dominant] / total
        if pct >= 0.6:
            results.append(TimeAffinityEntry(
                song_name=name,
                artist=artist,
                dominant_slot=dominant,
                slot_percentage=round(pct, 2),
                total_plays=total,
            ))

    results.sort(key=lambda x: x.total_plays, reverse=True)
    return results[:15]


# ---------------------------------------------------------------------------
# Analyzer 2: Weather affinity
# ---------------------------------------------------------------------------


async def _compute_weather_affinity(db: AsyncSession) -> list[WeatherAffinityEntry]:
    rows = await db.execute(
        select(
            ListeningHistory.song_id,
            Song.name,
            Song.artist,
            Song.genre,
            DJSession.weather_summary,
            ListeningHistory.completion_rate,
        )
        .join(QueueItem, ListeningHistory.queue_item_id == QueueItem.id)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .join(Song, ListeningHistory.song_id == Song.id)
        .where(
            ListeningHistory.event == "started",
            DJSession.weather_summary.isnot(None),
            ListeningHistory.song_id.isnot(None),
        )
    )
    events = rows.all()

    # Per-weather-category aggregation
    weather_data: dict[str, dict] = {}  # cat -> {songs: {key: count}, artists: {name: count}, genres: {g: count}, total}
    for song_id, name, artist, genre, weather_summary, completion_rate in events:
        cats = _classify_weather(weather_summary)
        for cat in cats:
            if cat not in weather_data:
                weather_data[cat] = {"songs": {}, "artists": {}, "genres": {}, "total": 0}
            wd = weather_data[cat]
            song_key = (name or "未知", artist or "未知")
            if song_key not in wd["songs"]:
                wd["songs"][song_key] = {"count": 0, "total_comp": 0.0}
            wd["songs"][song_key]["count"] += 1
            wd["songs"][song_key]["total_comp"] += (completion_rate or 0)
            wd["artists"][artist or "未知"] = wd["artists"].get(artist or "未知", 0) + 1
            if genre:
                wd["genres"][genre] = wd["genres"].get(genre, 0) + 1
            wd["total"] += 1

    results: list[WeatherAffinityEntry] = []
    for cat, data in weather_data.items():
        if data["total"] < 3:
            continue
        # Top 5 songs
        sorted_songs = sorted(data["songs"].items(), key=lambda x: x[1]["count"], reverse=True)
        top_songs = [
            SongRef(name=k[0], artist=k[1], play_count=v["count"],
                     completion_rate=round(v["total_comp"] / v["count"], 2) if v["count"] else 0)
            for k, v in sorted_songs[:5]
        ]
        # Top 3 artists
        sorted_artists = sorted(data["artists"].items(), key=lambda x: x[1], reverse=True)
        top_artists = [a for a, _ in sorted_artists[:3]]
        # Dominant genre
        top_genre = max(data["genres"], key=lambda g: data["genres"][g]) if data["genres"] else None

        # Build insight
        top_artist_str = "、".join(top_artists[:2]) if top_artists else ""
        top_song_str = f"《{top_songs[0].name}》" if top_songs else ""
        if top_song_str and top_artist_str:
            insight = f"{cat}你最常听{top_artist_str}的{top_song_str}"
        elif top_song_str:
            insight = f"{cat}你最常听{top_song_str}"
        else:
            insight = f"{cat}你有独特的听歌品味"

        results.append(WeatherAffinityEntry(
            weather_category=cat,
            top_songs=top_songs,
            top_artists=top_artists,
            dominant_genre=top_genre,
            insight=insight,
            total_plays=data["total"],
        ))

    results.sort(key=lambda x: x.total_plays, reverse=True)
    return results


# ---------------------------------------------------------------------------
# Analyzer 3: Scene / mood affinity
# ---------------------------------------------------------------------------


async def _compute_scene_affinity(db: AsyncSession) -> list[SceneAffinityEntry]:
    rows = await db.execute(
        select(
            ListeningHistory.song_id,
            Song.name,
            Song.artist,
            Song.genre,
            Song.mood_tags,
            Song.bpm,
            DJSession.user_request,
            ListeningHistory.completion_rate,
        )
        .join(QueueItem, ListeningHistory.queue_item_id == QueueItem.id)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .join(Song, ListeningHistory.song_id == Song.id)
        .where(
            ListeningHistory.event == "started",
            ListeningHistory.song_id.isnot(None),
        )
    )
    events = rows.all()

    # Per-scene-keyword aggregation
    scene_data: dict[str, dict] = {}
    for song_id, name, artist, genre, mood_tags, bpm, user_request, comp_rate in events:
        keywords = _match_scenes(user_request)
        for kw in keywords:
            if kw not in scene_data:
                scene_data[kw] = {
                    "genres": {}, "bpm_total": 0.0, "bpm_count": 0,
                    "mood_tags": {}, "artists": {}, "songs": {}, "count": 0,
                }
            sd = scene_data[kw]
            if genre:
                sd["genres"][genre] = sd["genres"].get(genre, 0) + 1
            if bpm:
                sd["bpm_total"] += bpm
                sd["bpm_count"] += 1
            if mood_tags:
                import json
                try:
                    tags = json.loads(mood_tags) if isinstance(mood_tags, str) else mood_tags
                    for t in (tags if isinstance(tags, list) else [tags]):
                        sd["mood_tags"][str(t)] = sd["mood_tags"].get(str(t), 0) + 1
                except (json.JSONDecodeError, TypeError):
                    pass
            sd["artists"][artist or "未知"] = sd["artists"].get(artist or "未知", 0) + 1
            song_key = (name or "未知",)
            sd["songs"][song_key] = sd["songs"].get(song_key, 0) + 1
            sd["count"] += 1

    results: list[SceneAffinityEntry] = []
    for kw, sd in scene_data.items():
        if sd["count"] < 3:
            continue
        # Preferred genres
        sorted_genres = sorted(sd["genres"].items(), key=lambda x: x[1], reverse=True)
        preferred_genres = sorted_genres[:5]
        # Avg BPM
        avg_bpm = round(sd["bpm_total"] / sd["bpm_count"], 1) if sd["bpm_count"] > 0 else None
        # Top mood tags
        sorted_moods = sorted(sd["mood_tags"].items(), key=lambda x: x[1], reverse=True)
        top_moods = [m for m, _ in sorted_moods[:5]]
        # Top artists
        sorted_artists = sorted(sd["artists"].items(), key=lambda x: x[1], reverse=True)
        top_artists = [a for a, _ in sorted_artists[:5]]

        # Build insight
        genre_str = preferred_genres[0][0] if preferred_genres else ""
        bpm_str = f"BPM约{int(avg_bpm)}" if avg_bpm else ""
        if genre_str and bpm_str:
            insight = f"{kw}时你偏好{genre_str}（{bpm_str}）"
        elif genre_str:
            insight = f"{kw}时你偏好{genre_str}"
        else:
            insight = f"{kw}时你有独特的听歌模式"

        results.append(SceneAffinityEntry(
            keyword=kw,
            preferred_genres=preferred_genres,
            avg_bpm=avg_bpm,
            top_mood_tags=top_moods,
            top_artists=top_artists,
            insight=insight,
            sample_count=sd["count"],
        ))

    results.sort(key=lambda x: x.sample_count, reverse=True)
    return results


# ---------------------------------------------------------------------------
# Analyzer 4: Cross-dimension insights
# ---------------------------------------------------------------------------


def _compute_cross_insights(
    time_aff: list[TimeAffinityEntry],
    weather_aff: list[WeatherAffinityEntry],
    scene_aff: list[SceneAffinityEntry],
) -> list[CrossInsight]:
    insights: list[CrossInsight] = []

    # Cross time × weather: find songs that appear in both
    night_songs = {(e.song_name, e.artist) for e in time_aff if e.dominant_slot in ("深夜", "晚上")}
    for wa in weather_aff:
        matches = [s for s in wa.top_songs if (s.name, s.artist) in night_songs]
        if matches:
            sample = matches[0]
            confidence = "high" if wa.total_plays > 20 else "medium" if wa.total_plays > 10 else "low"
            insights.append(CrossInsight(
                text=f"{wa.weather_category}的深夜你最常听{sample.artist}的《{sample.name}》",
                confidence=confidence,
                dimensions=["time", "weather"],
            ))
        if len(insights) >= 8:
            break

    # Cross time × scene: night + overtime
    overtime_entry = next((s for s in scene_aff if s.keyword in ("加班", "工作")), None)
    night_count = sum(1 for e in time_aff if e.dominant_slot in ("深夜", "晚上"))
    if overtime_entry and night_count > 0 and len(insights) < 8:
        bpm_note = f"，BPM多在{int(overtime_entry.avg_bpm)}左右" if overtime_entry.avg_bpm else ""
        insights.append(CrossInsight(
            text=f"深夜加班时你偏好{overtime_entry.preferred_genres[0][0] if overtime_entry.preferred_genres else '氛围'}音乐{bpm_note}",
            confidence="high" if overtime_entry.sample_count > 15 else "medium",
            dimensions=["time", "scene"],
        ))

    # Cross time × weather × scene: find dominant listening pattern
    slots = {}
    for e in time_aff:
        slots[e.dominant_slot] = slots.get(e.dominant_slot, 0) + 1
    dominant_slot = max(slots, key=lambda s: slots[s]) if slots else None

    if dominant_slot and weather_aff and len(insights) < 8:
        wa = weather_aff[0]
        time_label = {"深夜": "深夜型", "晚上": "夜间型", "清晨": "晨型", "上午": "上午型",
                       "下午": "下午型", "傍晚": "傍晚型", "中午": "午间型"}.get(dominant_slot, f"{dominant_slot}型")
        pct = len([e for e in time_aff if e.dominant_slot == dominant_slot]) / max(len(time_aff), 1)
        insights.append(CrossInsight(
            text=f"你是{time_label}听众，约{int(pct * 100)}%的高频歌曲集中在{dominant_slot}时段",
            confidence="high" if len(time_aff) > 10 else "medium",
            dimensions=["time"],
        ))

    # Cross scene × weather
    for sa in scene_aff[:3]:
        for wa in weather_aff[:2]:
            if len(insights) >= 8:
                break
            shared_artists = set(sa.top_artists[:3]) & set(wa.top_artists[:3])
            if shared_artists:
                artist_str = "、".join(list(shared_artists)[:2])
                insights.append(CrossInsight(
                    text=f"{sa.keyword}时你爱听{artist_str}，尤其在{wa.weather_category}天",
                    confidence="medium",
                    dimensions=["scene", "weather"],
                ))

    return insights[:8]


# ---------------------------------------------------------------------------
# Persona paragraph builder
# ---------------------------------------------------------------------------


def _build_persona_paragraph(
    ne_aff: NeteaseAffinity | None,
    time_aff: list[TimeAffinityEntry],
    weather_aff: list[WeatherAffinityEntry],
    scene_aff: list[SceneAffinityEntry],
    cross_insights: list[CrossInsight],
    total_listens: int,
) -> str:
    parts: list[str] = ["【你的音乐画像】"]

    # ── NetEase all-time stats (volume signal) ──
    if ne_aff and ne_aff.top_artists:
        top_artists_str = "、".join(
            f"{artist}({count}次)" for artist, count in ne_aff.top_artists[:8]
        )
        parts.append(
            f"网易云累计播放 {ne_aff.total_plays} 次，"
            f"涵盖 {ne_aff.total_songs_tracked} 首歌。"
            f"你最常听的艺人是：{top_artists_str}。"
        )

        if ne_aff.top_songs[:5]:
            top_songs_str = "、".join(
                f"《{name}》({count}次)" for name, _, count in ne_aff.top_songs[:5]
            )
            parts.append(f"高频单曲：{top_songs_str}。")

    # ── Dominant time pattern (radio data) ──
    slots = {}
    for e in time_aff:
        slots[e.dominant_slot] = slots.get(e.dominant_slot, 0) + 1
    if slots:
        dominant = max(slots, key=lambda s: slots[s])
        pct = slots[dominant] / len(time_aff)
        time_labels = {"深夜": "深夜型", "晚上": "夜间型", "清晨": "晨型", "上午": "上午型",
                       "下午": "下午型", "傍晚": "傍晚型"}
        label = time_labels.get(dominant, f"{dominant}型")
        parts.append(f"你在电台里是{label}听众，约{int(pct * 100)}%听歌时间在{dominant}。")

    # ── Weather summary ──
    if weather_aff:
        wa_lines = []
        for wa in weather_aff[:3]:
            wa_lines.append(f"  {wa.insight}")
        if wa_lines:
            parts.append("天气与音乐：\n" + "\n".join(wa_lines))

    # ── Scene summary ──
    if scene_aff:
        sa_lines = []
        for sa in scene_aff[:4]:
            sa_lines.append(f"  {sa.insight}")
        if sa_lines:
            parts.append("场景偏好：\n" + "\n".join(sa_lines))

    # ── Cross insights ──
    if cross_insights:
        ctx_lines = [f"  {ci.text}" for ci in cross_insights[:4]]
        parts.append("关键发现：\n" + "\n".join(ctx_lines))

    # ── Cautions ──
    cautions = _derive_cautions(weather_aff, scene_aff)
    if cautions:
        parts.append("注意事项：\n" + "\n".join(f"  - {c}" for c in cautions))

    return "\n\n".join(parts)


def _derive_cautions(
    weather_aff: list[WeatherAffinityEntry],
    scene_aff: list[SceneAffinityEntry],
) -> list[str]:
    cautions: list[str] = []

    # If rain weather has strong affinity for ambient/slow, caution against fast pop
    for wa in weather_aff:
        if wa.weather_category == "雨天" and wa.dominant_genre:
            low_genres = {"ambient", "post-rock", "lofi", "lo-fi", "chill", "acoustic", "classical", "jazz"}
            if wa.dominant_genre.lower() in low_genres:
                cautions.append("雨夜不适合推快节奏流行歌或激昂摇滚")
                break

    # If "加班/工作" prefers low BPM, caution against upbeat during work
    overtime = next((s for s in scene_aff if s.keyword in ("加班", "工作")), None)
    if overtime and overtime.avg_bpm and overtime.avg_bpm < 100:
        cautions.append("加班/工作场景优先选纯音乐或低BPM歌曲，减少歌词干扰")

    # If "运动" prefers high BPM
    exercise = next((s for s in scene_aff if s.keyword in ("运动", "跑步", "健身")), None)
    if exercise and exercise.avg_bpm and exercise.avg_bpm > 110:
        cautions.append("运动场景避免过于舒缓的慢歌，优先高BPM快节奏")

    return cautions
