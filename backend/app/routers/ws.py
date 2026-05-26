import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from ..utils.broadcast import ws_manager

router = APIRouter()


@router.websocket("/ws/radio")
async def radio_websocket(ws: WebSocket, user_id: int = Query(...)):
    await ws_manager.connect(ws, user_id)
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
                msg_type = data.get("type", "")

                if msg_type == "command":
                    action = data.get("action", "")
                    if action in ("skip", "stop"):
                        await ws_manager.broadcast_to_user(user_id, {
                            "type": "command",
                            "action": action,
                        })

                elif msg_type == "progress_report":
                    await ws_manager.broadcast_to_user(user_id, {
                        "type": "progress",
                        "queue_item_id": data.get("queue_item_id"),
                        "position_seconds": data.get("position_seconds", 0),
                    })

                elif msg_type == "ping":
                    try:
                        await ws.send_text(json.dumps({"type": "pong"}))
                    except Exception:
                        pass

                elif msg_type == "refill":
                    pass

                elif msg_type == "error_report":
                    await ws_manager.broadcast_to_user(user_id, {
                        "type": "error",
                        "queue_item_id": data.get("queue_item_id"),
                        "message": data.get("reason", "unknown"),
                    })

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
