import asyncio
import edge_tts
from ..config import TTS_CACHE_DIR, TTS_VOICE, TTS_RATE


async def generate_tts(text: str, file_id: int) -> str:
    """Generate TTS MP3 file. Returns relative path."""
    output_path = TTS_CACHE_DIR / f"{file_id}.mp3"

    communicate = edge_tts.Communicate(
        text=text,
        voice=TTS_VOICE,
        rate=TTS_RATE,
    )
    await communicate.save(str(output_path))

    return f"/api/audio/tts/{file_id}.mp3"


async def generate_tts_batch(items: list[tuple[int, str]]) -> dict[int, str]:
    """Generate TTS for multiple items in parallel (max 3 at a time)."""
    sem = asyncio.Semaphore(3)

    async def _gen(item_id: int, text: str) -> tuple[int, str]:
        async with sem:
            path = await generate_tts(text, item_id)
            return item_id, path

    tasks = [_gen(item_id, text) for item_id, text in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = {}
    for r in results:
        if isinstance(r, Exception):
            print(f"TTS generation error: {r}")
            continue
        item_id, path = r
        output[item_id] = path

    return output
