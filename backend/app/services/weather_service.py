import httpx
from ..config import OPENWEATHER_API_KEY, WEATHER_ENABLED

# Music vibe hints per weather condition
_VIBE_MAP = {
    "Rain": "温暖、舒缓、氛围感",
    "Drizzle": "温暖、舒缓、氛围感",
    "Thunderstorm": "深沉、有力、戏剧性",
    "Snow": "安静、纯净、钢琴曲",
    "Clear": "轻快、明亮、元气",
    "Clouds": "慵懒、柔和、沙发音乐",
    "Mist": "朦胧、迷幻、氛围电子",
    "Fog": "朦胧、迷幻、氛围电子",
    "Haze": "朦胧、慵懒、低保真",
    "Dust": "粗粝、复古、蓝调摇滚",
    "Sand": "异域、世界音乐、迷幻",
    "Squall": "激烈、戏剧性、后摇",
    "Tornado": "激烈、紧张、工业电子",
}


async def locate_by_ip(client_ip: str) -> dict | None:
    """IP geolocation via ip-api.com (free, no API key). Returns {city, lat, lon, country} or None."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            if client_ip in ("127.0.0.1", "::1", "localhost") or client_ip.startswith("192.168.") or client_ip.startswith("10.") or client_ip.startswith("172."):
                # Local/private IP: query server's own public IP location as fallback
                resp = await client.get("http://ip-api.com/json/")
            else:
                resp = await client.get(f"http://ip-api.com/json/{client_ip}")
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("status") != "success":
                return None
            return {
                "city": data.get("city", ""),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
                "country": data.get("country", ""),
            }
    except Exception:
        return None


async def fetch_weather(lat: float, lon: float) -> dict | None:
    """Fetch current weather from OpenWeather. Returns parsed data or None."""
    if not OPENWEATHER_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": OPENWEATHER_API_KEY,
                    "units": "metric",
                    "lang": "zh_cn",
                },
            )
            if resp.status_code != 200:
                return None
            return resp.json()
    except Exception:
        return None


def build_weather_summary(city: str, weather_data: dict) -> str:
    """Build a Chinese weather summary string with music vibe hint, for DJ prompt injection."""
    weather_list = weather_data.get("weather", [{}])
    main_weather = weather_list[0] if weather_list else {}
    condition = main_weather.get("description", "未知")
    condition_main = main_weather.get("main", "")

    main_data = weather_data.get("main", {})
    temp = main_data.get("temp")
    feels_like = main_data.get("feels_like")
    humidity = main_data.get("humidity")

    parts = [f"{city}今天天气{condition}"]

    if feels_like is not None:
        parts.append(f"体感 {feels_like:.0f}°C")
    elif temp is not None:
        parts.append(f"温度 {temp:.0f}°C")

    if humidity is not None:
        parts.append(f"湿度 {humidity}%")

    summary = "，".join(parts) + "。"

    # Add music vibe hint
    vibe = _VIBE_MAP.get(condition_main, "")
    if not vibe:
        if temp is not None and temp > 30:
            vibe = "清凉、轻松、解暑"
        elif feels_like is not None and feels_like < 5:
            vibe = "温暖、醇厚、包裹感"

    if vibe:
        summary += f" 适合{vibe}的音乐。"

    return summary


async def get_weather_summary(client_ip: str) -> str | None:
    """Orchestrate IP geolocation + weather fetch + summary. Returns None if unavailable."""
    if not WEATHER_ENABLED:
        return None

    location = await locate_by_ip(client_ip)
    if not location or not location.get("city"):
        return None

    weather = await fetch_weather(location["lat"], location["lon"])
    if not weather:
        return None

    return build_weather_summary(location["city"], weather)


async def get_weather_structured(client_ip: str) -> dict | None:
    """Orchestrate IP geolocation + weather fetch + structured data. Returns structured fields + summary."""
    if not WEATHER_ENABLED:
        return None

    location = await locate_by_ip(client_ip)
    if not location or not location.get("city"):
        return None

    weather = await fetch_weather(location["lat"], location["lon"])
    if not weather:
        return None

    weather_list = weather.get("weather", [{}])
    main_weather = weather_list[0] if weather_list else {}
    main_data = weather.get("main", {})

    return {
        "city": location["city"],
        "country": location.get("country", ""),
        "temperature": round(main_data["temp"]) if main_data.get("temp") is not None else None,
        "feels_like": round(main_data["feels_like"]) if main_data.get("feels_like") is not None else None,
        "humidity": main_data.get("humidity"),
        "condition": main_weather.get("description", ""),
        "condition_code": main_weather.get("main", ""),
        "summary": build_weather_summary(location["city"], weather),
    }
