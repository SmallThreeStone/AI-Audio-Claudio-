import socket
import time
import asyncio
from async_upnp_client.aiohttp import AiohttpRequester
from async_upnp_client.client_factory import UpnpFactory
from async_upnp_client.search import async_search as async_ssdp_search
from async_upnp_client.profiles.dlna import DmrDevice

from ..config import LAN_IP

# Cache SSDP results (short-lived, LAN devices don't change often)
_cache: dict = {"devices": [], "ts": 0}
_CACHE_TTL = 60  # seconds
_SSDP_TIMEOUT = 4  # seconds


def get_lan_ip() -> str:
    """Get the LAN IP address. Use config override if set, else auto-detect."""
    if LAN_IP:
        return LAN_IP

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and not ip.startswith("0."):
                return ip
    except Exception:
        pass
    return "127.0.0.1"


async def discover_devices(force: bool = False) -> list[dict]:
    """Discover DLNA MediaRenderer devices on LAN via SSDP. Results cached for 60s."""
    now = time.time()
    if not force and _cache["devices"] and (now - _cache["ts"]) < _CACHE_TTL:
        return _cache["devices"]

    try:
        results = await async_ssdp_search(
            service_type="urn:schemas-upnp-org:device:MediaRenderer:1",
            timeout=_SSDP_TIMEOUT,
        )
    except Exception:
        results = []

    devices = []
    for d in results:
        devices.append({
            "udn": d.udn if hasattr(d, "udn") else d.get("_udn", ""),
            "name": d.friendly_name if hasattr(d, "friendly_name") else d.get("friendly_name", "Unknown"),
            "location": d.location if hasattr(d, "location") else d.get("location", ""),
            "manufacturer": d.manufacturer if hasattr(d, "manufacturer") else d.get("manufacturer", ""),
        })

    _cache["devices"] = devices
    _cache["ts"] = now
    return devices


async def _connect_device(location: str) -> DmrDevice:
    """Connect to a DLNA device and return a DmrDevice profile."""
    requester = AiohttpRequester(timeout=10)
    factory = UpnpFactory(requester)
    upnp_device = await factory.async_create_device(location)
    return DmrDevice(upnp_device, requester)


async def play_url(device_location: str, audio_url: str, title: str = "AI Radio") -> dict:
    """Push an audio URL to a DLNA renderer and start playback."""
    dmr = await _connect_device(device_location)

    try:
        await dmr.async_set_transport_uri(media_url=audio_url, media_title=title)
    except Exception:
        # Some renderers need explicit Play after SetAVTransportURI
        try:
            avt = dmr.device.service("urn:schemas-upnp-org:service:AVTransport:1")
            await avt.async_call_action("SetAVTransportURI", InstanceID=0, CurrentURI=audio_url, CurrentURIMetaData="")
            await avt.async_call_action("Play", InstanceID=0, Speed="1")
        except Exception as e:
            raise RuntimeError(f"DLNA play failed: {e}")

    return {"status": "playing", "title": title}


async def stop_device(device_location: str) -> dict:
    """Stop playback on a DLNA renderer."""
    dmr = await _connect_device(device_location)
    await dmr.async_stop()
    return {"status": "stopped"}


async def set_volume(device_location: str, volume: int) -> dict:
    """Set volume on a DLNA renderer (0-100)."""
    dmr = await _connect_device(device_location)
    try:
        rc = dmr.device.service("urn:schemas-upnp-org:service:RenderingControl:1")
        await rc.async_call_action("SetVolume", InstanceID=0, Channel="Master", DesiredVolume=volume)
    except Exception:
        pass  # Some renderers don't support volume control
    return {"status": "ok", "volume": volume}


def build_audio_url(song_id: int) -> str:
    """Build a LAN-accessible audio URL for a song."""
    ip = get_lan_ip()
    return f"http://{ip}:8000/api/audio/music/{song_id}"
