import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class WSManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, data: dict):
        message = json.dumps(data, ensure_ascii=False)
        dead = []
        for ws in self.connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = WSManager()


@router.websocket("/ws/radio")
async def radio_websocket(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
                msg_type = data.get("type", "")

                if msg_type == "command":
                    action = data.get("action", "")
                    if action in ("skip", "stop"):
                        await ws_manager.broadcast({
                            "type": "command",
                            "action": action,
                        })

                elif msg_type == "progress_report":
                    await ws_manager.broadcast({
                        "type": "progress",
                        "queue_item_id": data.get("queue_item_id"),
                        "position_seconds": data.get("position_seconds", 0),
                    })

                elif msg_type == "refill":
                    # Refill will be handled by REST endpoint /api/radio/skip
                    pass

                elif msg_type == "error_report":
                    await ws_manager.broadcast({
                        "type": "error",
                        "queue_item_id": data.get("queue_item_id"),
                        "message": data.get("reason", "unknown"),
                    })

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
