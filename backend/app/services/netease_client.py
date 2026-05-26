import time
import aiohttp
from ..config import SIDECAR_URL


class NeteaseClient:
    def __init__(self):
        self.base = SIDECAR_URL
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self):
        if self._session:
            await self._session.close()
            self._session = None

    async def _get(self, path: str, params: dict | None = None, cookies: dict | None = None, headers: dict | None = None) -> dict:
        s = await self._get_session()
        async with s.get(
            f"{self.base}{path}", params=params,
            cookies=cookies, headers=headers,
        ) as r:
            return await r.json()

    async def _post(self, path: str, data: dict | None = None, cookies: dict | None = None) -> dict:
        s = await self._get_session()
        async with s.post(
            f"{self.base}{path}", data=data,
            cookies=cookies,
        ) as r:
            return await r.json()

    # --- Login ---
    async def qr_key(self) -> dict:
        return await self._get("/login/qr/key", {"t": int(time.time() * 1000)})

    async def qr_create(self, key: str) -> dict:
        return await self._get("/login/qr/create", {"key": key, "qrimg": "true", "t": int(time.time() * 1000)})

    async def qr_check(self, key: str) -> dict:
        # x-apicache-bypass skips the sidecar's 2-min cache, critical for polling
        return await self._get(
            "/login/qr/check",
            {"key": key, "t": int(time.time() * 1000)},
            headers={"x-apicache-bypass": "1"},
        )

    async def login_status(self, cookies: dict) -> dict:
        """Check if cookies are still valid, returns account info."""
        return await self._get("/login/status", cookies=cookies)

    # --- User ---
    async def user_playlist(self, uid: int, cookies: dict) -> dict:
        return await self._get("/user/playlist", {"uid": uid}, cookies=cookies)

    async def user_account(self, cookies: dict) -> dict:
        return await self._get("/user/account", cookies=cookies)

    # --- Playlist ---
    async def playlist_detail(self, playlist_id: int, cookies: dict) -> dict:
        return await self._get("/playlist/detail", {"id": playlist_id}, cookies=cookies)

    async def playlist_track_all(self, playlist_id: int, cookies: dict, offset: int = 0, limit: int = 1000) -> dict:
        return await self._get(
            "/playlist/track/all",
            {"id": playlist_id, "offset": offset, "limit": limit},
            cookies=cookies,
        )

    # --- Song ---
    async def song_detail(self, song_ids: list[int], cookies: dict) -> dict:
        return await self._get("/song/detail", {"ids": ",".join(map(str, song_ids))}, cookies=cookies)

    async def song_url(self, song_id: int, cookies: dict, br: int = 320000) -> dict:
        return await self._get("/song/url", {"id": song_id, "br": br}, cookies=cookies)

    # --- Liked ---
    async def like_list(self, uid: int, cookies: dict) -> dict:
        return await self._get("/likelist", {"uid": uid}, cookies=cookies)

    # --- Listening History ---
    async def user_record(self, uid: int, cookies: dict, record_type: int = 0) -> dict:
        """Get user listening history. type=0 for all-time, type=1 for weekly."""
        return await self._get("/user/record", {"uid": uid, "type": record_type}, cookies=cookies)

    # --- Phone Login ---
    async def phone_login(self, phone: str, password: str = "", countrycode: str = "86", captcha: str = "") -> dict:
        params = {"phone": phone, "countrycode": countrycode}
        if captcha:
            params["captcha"] = captcha
        else:
            params["password"] = password
        return await self._get("/login/cellphone", params)

    async def captcha_sent(self, phone: str, countrycode: str = "86") -> dict:
        return await self._get("/captcha/sent", {"phone": phone, "countrycode": countrycode})

    # --- Lyrics ---
    async def song_lyric(self, song_id: int, cookies: dict) -> dict:
        return await self._get("/lyric", {"id": song_id}, cookies=cookies)


netease = NeteaseClient()
