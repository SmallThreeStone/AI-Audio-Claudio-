import asyncio
import logging

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

logger = logging.getLogger(__name__)

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

    # F18: Batch-load all songs referenced in the script to avoid N+1 queries
    from ..models.song import Song
    song_ids_in_script = [e["song_id"] for e in script.get("script", []) if e["type"] == "song"]
    existing_songs: set[int] = set()
    if song_ids_in_script:
        batch_result = await db.execute(select(Song.id).where(Song.id.in_(song_ids_in_script)))
        existing_songs = {r[0] for r in batch_result.all()}

    # Script items
    for entry in script.get("script", []):
        if entry["type"] == "song":
            song_id = entry["song_id"]

            # Verify song exists (lookup in pre-loaded set, not DB query)
            if song_id not in existing_songs:
                logger.warning("Skipping non-existent song_id=%d in script", song_id)
                continue

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

    # Capture user_id from session for song URL resolution
    owner_user_id = s.user_id if s else None

    await db.commit()

    sem = asyncio.Semaphore(3)

    async def resolve_one_song(item_id: int, song_id: int):
        async with sem:
            async with async_session_factory() as task_db:
                url = await get_song_url(task_db, song_id, owner_user_id)
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

    # F21: Run song URL resolution first, then TTS synthesis — serial execution
    # avoids SQLite "database is locked" from parallel writes to the same file.
    await resolve_all_songs()
    await synthesize_all_tts()

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

    # F16: Count only items with status='ready' that haven't been played yet,
    # not total_items - played_items which includes errored/unplayable items.
    played_pos = await db.execute(
        select(QueueItem.position).where(
            QueueItem.session_id == session_id,
            QueueItem.status == 'playing'
        ).order_by(QueueItem.position.desc()).limit(1)
    )
    current_pos = played_pos.scalar() or 0
    ready_count_result = await db.execute(
        select(QueueItem).where(
            QueueItem.session_id == session_id,
            QueueItem.status == 'ready',
            QueueItem.position >= current_pos
        )
    )
    remaining = len(ready_count_result.scalars().all())
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
        logger.error("Refill error: %s", e)
        session.status = "ready"
        await db.commit()
        await ws_manager.broadcast_to_user(session.user_id or 0, {
            "type": "error",
            "message": f"续杯失败: {str(e)}",
        })

    # After refill attempt (success or failure), check if the session is truly exhausted.
    # If no playable items remain, mark completed so the frontend can reset its state.
    remaining_after = await db.execute(
        select(QueueItem).where(
            QueueItem.session_id == session_id,
            QueueItem.status == 'ready',
            QueueItem.position >= current_pos,
        )
    )
    if len(remaining_after.scalars().all()) == 0:
        session = (await db.execute(select(DJSession).where(DJSession.id == session_id))).scalar()
        if session and session.status != "completed":
            session.status = "completed"
            await db.commit()
            from ..routers.radio import _session_status_msg
            await ws_manager.broadcast_to_user(session.user_id or 0, _session_status_msg(session))

    return False


async def replace_upcoming(db: AsyncSession, session_id: int, script: dict, current_position: int) -> int:
    """Replace all upcoming queue items with a new script (used for mid-session mood adjustment)."""
    # Delete all upcoming items
    delete_result = await db.execute(
        select(QueueItem).where(
            QueueItem.session_id == session_id,
            QueueItem.position > current_position,
        )
    )
    to_delete = delete_result.scalars().all()
    for item in to_delete:
        await db.delete(item)
    await db.flush()

    # Build new items starting from current_position + 1
    new_count = await build_queue_from_script(db, script, session_id, start_position=current_position + 1)

    # Update session total_items
    session_result = await db.execute(select(DJSession).where(DJSession.id == session_id))
    s = session_result.scalar()
    if s:
        s.total_items = current_position + 1 + new_count
        s.status = "ready"

    await db.commit()
    return new_count
