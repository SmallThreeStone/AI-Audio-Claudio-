import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..config import TTS_CACHE_DIR
from ..services.audio_proxy import get_song_url

router = APIRouter(prefix="/api/audio", tags=["audio"])


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
async def serve_music(song_id: int, session: AsyncSession = Depends(get_session)):
    url = await get_song_url(session, song_id)
    if not url:
        raise HTTPException(status_code=404, detail="Song URL not available")

    async def stream_audio():
        timeout = httpx.Timeout(10.0, read=600.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("GET", url) as response:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk

    return StreamingResponse(
        stream_audio(),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
