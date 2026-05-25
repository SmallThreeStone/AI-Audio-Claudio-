import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import async_session as async_session_factory
from ..models.dj_session import DJSession
from ..models.queue_item import QueueItem
from ..models.user import User
from ..services.dj_engine import generate_continuation, DJ_PERSONAS
from ..services.tts_engine import generate_tts_batch
from ..services.audio_proxy import get_song_url
from ..utils.broadcast import ws_manager


async def build_queue_from_script(db: AsyncSession, script: dict, session_id: int, start_position: int = 0, progress_callback=None):
    """Process a radio script: create QueueItems, generate TTS, resolve URLs."""
    # Get session persona for voice selection
    persona = "xiaoyu"
    session_result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    s = session_result.scalar()
    if s and s.persona:
        persona = s.persona
    p = DJ_PERSONAS.get(persona, DJ_PERSONAS["xiaoyu"])
    voice = p["voice"]
    emotion_tags = p.get("emotion_tags", "")

    # Read user's TTS provider preference
    tts_provider = None
    if s and s.user_id:
        user_result = await db.execute(select(User).where(User.id == s.user_id))
        user = user_result.scalar()
        if user:
            tts_provider = user.tts_provider

    position = start_position
    tts_tasks = []
    song_tasks = []  # (item_id, song_id)

    # Greeting TTS
    greeting = script.get("greeting_tts")
    if greeting:
        item = QueueItem(
            session_id=session_id,
            position=position,
            item_type="tts_intro",
            tts_text=greeting,
            tts_voice=voice,
            status="tts_generating",
        )
        db.add(item)
        await db.flush()
        tts_tasks.append((item.id, greeting))
        position += 1

    # Script items
    for entry in script.get("script", []):
        if entry["type"] == "song":
            song_id = entry["song_id"]

            # Verify song exists
            from ..models.song import Song
            song_result = await db.execute(select(Song).where(Song.id == song_id))
            song = song_result.scalar()

            item = QueueItem(
                session_id=session_id,
                position=position,
                item_type="song",
                song_id=song_id,
                intro_text=entry.get("intro_text", ""),
                status="pending",
            )
            db.add(item)
            await db.flush()
            song_tasks.append((item.id, song_id))
            position += 1

        elif entry["type"] == "tts":
            item = QueueItem(
                session_id=session_id,
                position=position,
                item_type="tts_bridge",
                tts_text=entry["text"],
                tts_voice=voice,
                status="tts_generating",
            )
            db.add(item)
            await db.flush()
            tts_tasks.append((item.id, entry["text"]))
            position += 1

    # Closing TTS
    closing = script.get("closing_tts")
    if closing:
        item = QueueItem(
            session_id=session_id,
            position=position,
            item_type="tts_outro",
            tts_text=closing,
            tts_voice=voice,
            status="tts_generating",
        )
        db.add(item)
        await db.flush()
        tts_tasks.append((item.id, closing))
        position += 1

    await db.commit()

    sem = asyncio.Semaphore(3)

    async def resolve_one_song(item_id: int, song_id: int):
        async with sem:
            async with async_session_factory() as task_db:
                url = await get_song_url(task_db, song_id)
                result = await task_db.execute(select(QueueItem).where(QueueItem.id == item_id))
                qi = result.scalar()
                if qi:
                    if url:
                        qi.stream_url = url
                        qi.status = "ready"
                    else:
                        qi.status = "error"
                        qi.error_message = "版权受限或无法获取播放链接"
                await task_db.commit()

    async def resolve_all_songs():
        if not song_tasks:
            return
        if progress_callback:
            await progress_callback("preparing", f"加载 {len(song_tasks)} 首歌曲 | 合成 {len(tts_tasks)} 段串词...")
        tasks = [resolve_one_song(item_id, song_id) for item_id, song_id in song_tasks]
        await asyncio.gather(*tasks)

    async def synthesize_all_tts():
        if not tts_tasks:
            return
        paths = await generate_tts_batch(tts_tasks, emotion_tags, provider=tts_provider)
        for item_id, audio_path in paths.items():
            result = await db.execute(select(QueueItem).where(QueueItem.id == item_id))
            qi = result.scalar()
            if qi:
                qi.tts_audio_path = audio_path
                qi.status = "ready"
        if progress_callback:
            await progress_callback("synthesizing", f"合成 DJ 串词完成")

    # Fetch song URLs and synthesize TTS in parallel
    await asyncio.gather(resolve_all_songs(), synthesize_all_tts())

    # Update session
    session_result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    s = session_result.scalar()
    if s:
        s.total_items = position
        s.status = "ready"

    await db.commit()

    return position


async def check_refill(db: AsyncSession, session_id: int) -> bool:
    """Check if refill is needed and trigger it. Returns True if refill was triggered."""
    result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    session = result.scalar()
    if not session or session.status == "completed":
        return False

    remaining = session.total_items - session.played_items
    if remaining > 3:
        return False

    # Get recently played song IDs
    recent = await db.execute(
        select(QueueItem.song_id)
        .where(QueueItem.session_id == session_id, QueueItem.item_type == "song", QueueItem.song_id != None)
        .order_by(QueueItem.position.desc())
        .limit(10)
    )
    recent_ids = [r[0] for r in recent.all() if r[0]]

    session.status = "refilling"
    await db.commit()

    try:
        script = await generate_continuation(db, session.user_request, recent_ids, count=5, persona=session.persona or "xiaoyu")
        await build_queue_from_script(db, script, session_id, start_position=session.total_items)

        # Broadcast updated queue
        from ..routers.radio import _broadcast_queue
        await _broadcast_queue(db, session_id)
        return True
    except Exception as e:
        print(f"Refill error: {e}")
        session.status = "ready"
        await db.commit()
        await ws_manager.broadcast_to_user(session.user_id or 0, {
            "type": "error",
            "message": f"续杯失败: {str(e)}",
        })

    return False
