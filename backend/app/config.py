import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# Load .env file if it exists
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR / 'radio.db'}"
COOKIES_FILE = DATA_DIR / "cookies.json"
TTS_CACHE_DIR = DATA_DIR / "tts_cache"

SIDECAR_PORT = int(os.getenv("SIDECAR_PORT", "3000"))
SIDECAR_URL = f"http://127.0.0.1:{SIDECAR_PORT}"

# DeepSeek API (OpenAI-compatible)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "") or os.getenv("ANTHROPIC_AUTH_TOKEN", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

TTS_VOICE = os.getenv("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
TTS_RATE = os.getenv("TTS_RATE", "+10%")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TTS_CACHE_DIR, exist_ok=True)
