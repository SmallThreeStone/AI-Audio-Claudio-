from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.dlna_service import discover_devices, play_url, stop_device, build_audio_url
from ..config import DLNA_ENABLED

router = APIRouter(prefix="/api/dlna", tags=["dlna"])


class PlayRequest(BaseModel):
    device_location: str
    song_id: int | None = None
    audio_url: str | None = None  # Direct URL override
    title: str = "AI Radio"


class StopRequest(BaseModel):
    device_location: str


@router.get("/devices")
async def list_devices(force: bool = False):
    """Discover DLNA MediaRenderer devices on the LAN."""
    if not DLNA_ENABLED:
        return {"devices": [], "message": "DLNA is disabled"}
    try:
        devices = await discover_devices(force=force)
        return {"devices": devices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Device discovery failed: {e}")


@router.post("/play")
async def play_on_device(body: PlayRequest):
    """Push audio to a DLNA renderer and start playback."""
    if not DLNA_ENABLED:
        raise HTTPException(status_code=400, detail="DLNA is disabled")

    if body.audio_url:
        url = body.audio_url
    elif body.song_id:
        url = build_audio_url(body.song_id)
    else:
        raise HTTPException(status_code=400, detail="Either song_id or audio_url is required")

    try:
        result = await play_url(body.device_location, url, body.title)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_on_device(body: StopRequest):
    """Stop playback on a DLNA renderer."""
    if not DLNA_ENABLED:
        raise HTTPException(status_code=400, detail="DLNA is disabled")
    try:
        result = await stop_device(body.device_location)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
