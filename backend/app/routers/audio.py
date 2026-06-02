import httpx
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_session
from ..config import TTS_CACHE_DIR
from ..services.audio_proxy import get_song_url
from ..services.netease_client import netease
from ..models import Song, User, Playlist
from ..models.playlist_song import playlist_song_table

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audio", tags=["audio"])

# Shared httpx client with connection pooling — avoids DNS+TCP+TLS overhead per request.
# Read timeout is generous (600s) for long audio streams.
_stream_client: httpx.AsyncClient | None = None


def _get_stream_client() -> httpx.AsyncClient:
    global _stream_client
    if _stream_client is None or _stream_client.is_closed:
        _stream_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=600.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _stream_client


@router.get("/tts/{file_id}.mp3")
async def serve_tts(file_id: int, request: Request):
    file_path = TTS_CACHE_DIR / f"{file_id}.mp3"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="TTS file not found")

    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        start, end = _parse_range(range_header, file_size)
        with open(file_path, "rb") as f:
            f.seek(start)
            data = f.read(end - start + 1)
        return Response(
            content=data,
            status_code=206,
            media_type="audio/mpeg",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(len(data)),
                "Accept-Ranges": "bytes",
            },
        )

    return FileResponse(file_path, media_type="audio/mpeg")


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse HTTP Range header, return (start, end) byte positions."""
    unit, _, spec = range_header.partition("=")
    if unit.strip() != "bytes":
        return 0, file_size - 1
    start_str, _, end_str = spec.partition("-")
    start = int(start_str) if start_str else 0
    end = int(end_str) if end_str else file_size - 1
    return max(0, start), min(end, file_size - 1)


@router.get("/music/{song_id}")
async def serve_music(song_id: int, request: Request, session: AsyncSession = Depends(get_session)):
    user_id = getattr(request.state, "user_id", None)
    # F31: HTMLAudioElement requests don't carry X-Client-Id header — accept ?cid= as fallback
    if not user_id:
        cid = request.query_params.get("cid")
        if cid:
            from sqlalchemy import select as _sel
            from ..models.user import User as _User
            result = await session.execute(_sel(_User).where(_User.client_id == cid))
            u = result.scalar()
            if u:
                user_id = u.id
    url = await _get_active_queue_stream_url(session, song_id, user_id) if user_id else None
    in_active_queue = await _song_in_user_active_queue(session, song_id, user_id) if user_id else False
    if not url and user_id and not in_active_queue and not await _song_in_user_library(session, song_id, user_id):
        logger.warning("[Audio] Song not in user's library: song_id=%d user_id=%s", song_id, user_id)
        raise HTTPException(status_code=404, detail="Song not found in user library")
    if not url:
        url = await get_song_url(session, song_id, user_id)
        if url and in_active_queue:
            await _update_active_queue_stream_url(session, song_id, user_id, url)
    if not url:
        logger.warning("[Audio] No URL for song_id=%d user_id=%s — returning 404", song_id, user_id)
        if user_id:
            await _mark_active_queue_song_error(session, song_id, user_id, "Song URL not available")
        raise HTTPException(status_code=404, detail="Song URL not available")

    logger.info("[Audio] Streaming song_id=%d user_id=%s", song_id, user_id)

    # F8: Get Content-Length from stream response headers — no separate HEAD request needed.
    # httpx.stream() response.headers already contains Content-Length and Content-Type.

    range_header = request.headers.get("range")

    async def stream_audio():
        client = _get_stream_client()
        stream_range = range_header  # captured from outer scope
        try:
            req_headers = {}
            if stream_range:
                req_headers["Range"] = stream_range
            async with client.stream("GET", url, headers=req_headers) as response:
                logger.info("[Audio] CDN response status=%d for song_id=%d", response.status_code, song_id)
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk
        except httpx.HTTPError as e:
            logger.error("[Audio] CDN stream error for song_id=%d: %s", song_id, e)
        except Exception as e:
            logger.error("[Audio] Unexpected stream error for song_id=%d: %s", song_id, e, exc_info=True)

    # Start streaming immediately — StreamingResponse handles the rest.
    # Content-Length and Content-Type will be set by the CDN response headers
    # when they arrive (via the first chunk), or left unset for chunked encoding.
    return StreamingResponse(
        stream_audio(),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )


async def _get_active_queue_stream_url(session: AsyncSession, song_id: int, user_id: int | None) -> str | None:
    if not user_id:
        return None
    from ..models.dj_session import DJSession
    from ..models.queue_item import QueueItem

    result = await session.execute(
        select(QueueItem.stream_url)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .where(
            DJSession.user_id == user_id,
            DJSession.status.in_(["ready", "playing", "refilling"]),
            QueueItem.song_id == song_id,
            QueueItem.status == "ready",
            QueueItem.stream_url != None,
        )
        .order_by(DJSession.created_at.desc(), QueueItem.position)
        .limit(1)
    )
    url = result.scalar()
    if url:
        logger.info("[Audio] Queue URL HIT for song_id=%d user_id=%s", song_id, user_id)
    return url


async def _song_in_user_active_queue(session: AsyncSession, song_id: int, user_id: int | None) -> bool:
    if not user_id:
        return False
    from ..models.dj_session import DJSession
    from ..models.queue_item import QueueItem

    result = await session.execute(
        select(QueueItem.id)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .where(
            DJSession.user_id == user_id,
            DJSession.status.in_(["ready", "playing", "refilling"]),
            QueueItem.song_id == song_id,
            QueueItem.item_type == "song",
        )
        .order_by(DJSession.created_at.desc(), QueueItem.position)
        .limit(1)
    )
    return result.scalar() is not None


async def _update_active_queue_stream_url(session: AsyncSession, song_id: int, user_id: int, url: str):
    from ..models.dj_session import DJSession
    from ..models.queue_item import QueueItem

    result = await session.execute(
        select(QueueItem)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .where(
            DJSession.user_id == user_id,
            DJSession.status.in_(["ready", "playing", "refilling"]),
            QueueItem.song_id == song_id,
            QueueItem.item_type == "song",
        )
        .order_by(DJSession.created_at.desc(), QueueItem.position)
        .limit(1)
    )
    qi = result.scalar()
    if not qi:
        return
    qi.stream_url = url
    qi.status = "ready"
    qi.error_message = None
    await session.commit()


async def _song_in_user_library(session: AsyncSession, song_id: int, user_id: int) -> bool:
    result = await session.execute(
        select(playlist_song_table.c.song_id)
        .join(Playlist, playlist_song_table.c.playlist_id == Playlist.id)
        .where(
            Playlist.user_id == user_id,
            playlist_song_table.c.song_id == song_id,
        )
        .limit(1)
    )
    return result.scalar() is not None


async def _mark_active_queue_song_error(session: AsyncSession, song_id: int, user_id: int, reason: str):
    from ..models.dj_session import DJSession
    from ..models.queue_item import QueueItem
    from ..utils.broadcast import ws_manager
    from ..routers.radio import _build_queue_response

    result = await session.execute(
        select(QueueItem, DJSession)
        .join(DJSession, QueueItem.session_id == DJSession.id)
        .where(
            DJSession.user_id == user_id,
            DJSession.status.in_(["ready", "playing", "refilling"]),
            QueueItem.song_id == song_id,
            QueueItem.status == "ready",
        )
        .order_by(DJSession.created_at.desc(), QueueItem.position)
        .limit(1)
    )
    row = result.first()
    if not row:
        return
    qi, active = row
    qi.status = "error"
    qi.error_message = reason
    await session.commit()
    data = await _build_queue_response(session, active)
    await ws_manager.broadcast_to_user(user_id, data)


@router.get("/lyrics/{song_id}")
async def get_lyrics(song_id: int, request: Request, session: AsyncSession = Depends(get_session)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Look up the song to get its netease_song_id
    if not await _song_in_user_library(session, song_id, user_id):
        raise HTTPException(status_code=404, detail="Song not found in user library")

    result = await session.execute(select(Song).where(Song.id == song_id))
    song = result.scalar()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Get user's cookies for Netease API auth
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cookies = json.loads(user.cookies_json or "{}")
    if not cookies:
        raise HTTPException(status_code=400, detail="User not logged in to Netease")

    try:
        lyric_data = await netease.song_lyric(song.netease_song_id, cookies)
    except Exception as e:
        logger.error("[Lyrics] Failed to fetch lyrics for song_id=%d netease_id=%d: %s",
                     song_id, song.netease_song_id, e)
        raise HTTPException(status_code=502, detail="Failed to fetch lyrics from Netease")

    lrc = lyric_data.get("lrc", {}) if isinstance(lyric_data, dict) else {}
    tlyric = lyric_data.get("tlyric", {}) if isinstance(lyric_data, dict) else {}

    return {
        "lrc": lrc.get("lyric", "") if isinstance(lrc, dict) else "",
        "tlrc": tlyric.get("lyric", "") if isinstance(tlyric, dict) else "",
    }
