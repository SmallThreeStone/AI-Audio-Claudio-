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

# TTS Provider: "edge" (default) or "fish"
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge")
TTS_VOICE = os.getenv("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
TTS_RATE = os.getenv("TTS_RATE", "+10%")

# Fish Audio TTS
FISH_AUDIO_API_KEY = os.getenv("FISH_AUDIO_API_KEY", "")
FISH_AUDIO_BASE_URL = os.getenv("FISH_AUDIO_BASE_URL", "https://api.fish.audio")
FISH_AUDIO_REFERENCE_ID = os.getenv("FISH_AUDIO_REFERENCE_ID", "")
FISH_AUDIO_EMOTION_TAGS = os.getenv("FISH_AUDIO_EMOTION_TAGS", "true").lower() == "true"

# OpenWeather API
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
WEATHER_ENABLED = os.getenv("WEATHER_ENABLED", "true").lower() == "true"

# DLNA / UPnP streaming
DLNA_ENABLED = os.getenv("DLNA_ENABLED", "true").lower() == "true"
LAN_IP = os.getenv("LAN_IP", "")  # Auto-detected if empty

# Google Calendar
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
CALENDAR_ENABLED = os.getenv("CALENDAR_ENABLED", "false").lower() == "true"

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TTS_CACHE_DIR, exist_ok=True)
