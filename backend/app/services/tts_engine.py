import asyncio
import httpx
from ..config import (
    TTS_CACHE_DIR, TTS_VOICE, TTS_RATE,
    TTS_PROVIDER, FISH_AUDIO_API_KEY, FISH_AUDIO_BASE_URL,
    FISH_AUDIO_REFERENCE_ID, FISH_AUDIO_EMOTION_TAGS,
)


class BaseTTSProvider:
    """Abstract TTS provider."""

    async def generate(self, text: str, file_id: int, emotion_tags: str = "") -> str:
        raise NotImplementedError

    async def generate_batch(self, items: list[tuple[int, str]], emotion_tags: str = "") -> dict[int, str]:
        sem = asyncio.Semaphore(3)

        async def _gen(item_id: int, text: str) -> tuple[int, str]:
            async with sem:
                path = await self.generate(text, item_id, emotion_tags)
                return item_id, path

        tasks = [_gen(item_id, text) for item_id, text in items]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[int, str] = {}
        for r in results:
            if isinstance(r, Exception):
                print(f"TTS generation error: {r}")
                continue
            item_id, path = r
            output[item_id] = path

        return output


class EdgeTTSProvider(BaseTTSProvider):
    """Original Edge TTS provider (free, no emotion control)."""

    async def generate(self, text: str, file_id: int, emotion_tags: str = "") -> str:
        import edge_tts
        output_path = TTS_CACHE_DIR / f"{file_id}.mp3"

        if output_path.exists():
            return f"/api/audio/tts/{file_id}.mp3"

        communicate = edge_tts.Communicate(
            text=text,
            voice=TTS_VOICE,
            rate=TTS_RATE,
        )
        await communicate.save(str(output_path))

        return f"/api/audio/tts/{file_id}.mp3"


class FishAudioProvider(BaseTTSProvider):
    """Fish Audio TTS provider with emotion control via inline tags."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=FISH_AUDIO_BASE_URL,
                headers={"Authorization": f"Bearer {FISH_AUDIO_API_KEY}"},
                timeout=30.0,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _apply_emotion(self, text: str, emotion_tags: str) -> str:
        if FISH_AUDIO_EMOTION_TAGS and emotion_tags:
            return f"{emotion_tags} {text}"
        return text

    async def generate(self, text: str, file_id: int, emotion_tags: str = "") -> str:
        client = await self._get_client()
        output_path = TTS_CACHE_DIR / f"{file_id}.mp3"

        if output_path.exists():
            return f"/api/audio/tts/{file_id}.mp3"

        text = self._apply_emotion(text, emotion_tags)

        payload: dict = {
            "text": text,
            "format": "mp3",
        }
        if FISH_AUDIO_REFERENCE_ID:
            payload["reference_id"] = FISH_AUDIO_REFERENCE_ID

        response = await client.post("/v1/tts", json=payload)
        response.raise_for_status()

        output_path.write_bytes(response.content)
        return f"/api/audio/tts/{file_id}.mp3"


def _get_provider(provider_name: str | None = None) -> BaseTTSProvider:
    name = provider_name or TTS_PROVIDER
    if name == "fish":
        return FishAudioProvider()
    return EdgeTTSProvider()


async def generate_tts(text: str, file_id: int, emotion_tags: str = "", provider: str | None = None) -> str:
    """Generate TTS MP3. Returns relative path to audio."""
    tts = _get_provider(provider)
    try:
        return await tts.generate(text, file_id, emotion_tags)
    finally:
        if isinstance(tts, FishAudioProvider):
            await tts.close()


async def generate_tts_batch(items: list[tuple[int, str]], emotion_tags: str = "", provider: str | None = None) -> dict[int, str]:
    """Generate TTS for multiple items in parallel (max 3 at a time)."""
    tts = _get_provider(provider)
    try:
        return await tts.generate_batch(items, emotion_tags)
    finally:
        if isinstance(tts, FishAudioProvider):
            await tts.close()
