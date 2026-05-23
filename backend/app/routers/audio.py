import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..config import TTS_CACHE_DIR
from ..services.audio_proxy import get_song_url

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.get("/tts/{file_id}.mp3")
async def serve_tts(file_id: int):
    file_path = TTS_CACHE_DIR / f"{file_id}.mp3"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="TTS file not found")
    return FileResponse(file_path, media_type="audio/mpeg")


@router.get("/music/{song_id}")
async def serve_music(song_id: int, session: AsyncSession = Depends(get_session)):
    url = await get_song_url(session, song_id)
    if not url:
        raise HTTPException(status_code=404, detail="Song URL not available")

    # Stream the audio through backend to avoid CORS issues
    async def stream_audio():
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", url, timeout=30) as response:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    yield chunk

    return StreamingResponse(
        stream_audio(),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
