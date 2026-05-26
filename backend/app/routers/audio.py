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
from ..models import Song, User

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
    url = await get_song_url(session, song_id, user_id)
    if not url:
        logger.warning("[Audio] No URL for song_id=%d user_id=%s — returning 404", song_id, user_id)
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


@router.get("/lyrics/{song_id}")
async def get_lyrics(song_id: int, request: Request, session: AsyncSession = Depends(get_session)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Look up the song to get its netease_song_id
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
