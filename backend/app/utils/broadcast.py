import json
import logging

logger = logging.getLogger(__name__)


class WSManager:
    """WebSocket connection manager with per-user channel isolation."""

    def __init__(self):
        # user_id -> list of WebSocket connections
        self._channels: dict[int, list] = {}
        # reverse lookup: WebSocket -> user_id
        self._user_of: dict[int, int] = {}

    async def connect(self, ws, user_id: int = 0):
        await ws.accept()
        self._channels.setdefault(user_id, []).append(ws)
        self._user_of[id(ws)] = user_id

    def disconnect(self, ws):
        user_id = self._user_of.pop(id(ws), 0)
        if user_id in self._channels:
            conns = self._channels[user_id]
            if ws in conns:
                conns.remove(ws)
            if not conns:
                del self._channels[user_id]

    async def broadcast_to_user(self, user_id: int, data: dict):
        """Send to all connections of a specific user."""
        message = json.dumps(data, ensure_ascii=False)
        dead = []
        for ws in self._channels.get(user_id, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_to_all(self, data: dict):
        """Send to all connected clients (system-wide messages only)."""
        message = json.dumps(data, ensure_ascii=False)
        dead = []
        for conns in self._channels.values():
            for ws in conns:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    # Backwards-compat alias for code that hasn't been migrated yet
    async def broadcast(self, data: dict):
        await self.broadcast_to_all(data)

    @property
    def user_count(self) -> int:
        return len(self._channels)


ws_manager = WSManager()
