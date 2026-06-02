import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from ..utils.broadcast import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/radio")
async def radio_websocket(ws: WebSocket, user_id: int = Query(...)):
    await ws_manager.connect(ws, user_id)
    logger.info("[WS] Client connected — user_id=%s total_users=%s", user_id, ws_manager.user_count)
    try:
        while True:
            msg = await ws.receive_text()
            try:
                data = json.loads(msg)
                msg_type = data.get("type", "")

                if msg_type not in ("progress_report", "ping"):
                    logger.info("[WS] rx user_id=%s type=%s data=%s", user_id, msg_type,
                               json.dumps({k: v for k, v in data.items() if k != 'type'}, ensure_ascii=False))

                if msg_type == "command":
                    action = data.get("action", "")
                    logger.info("[WS] command user_id=%s action=%s", user_id, action)
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
                    logger.info("[WS] refill request user_id=%s", user_id)
                    from ..services.queue_manager import check_refill
                    from ..database import async_session as _as
                    async with _as() as s:
                        from sqlalchemy import select as _sel
                        from ..models.dj_session import DJSession
                        r = await s.execute(
                            _sel(DJSession).where(
                                DJSession.user_id == user_id,
                                DJSession.status.in_(["ready", "playing"]),
                            ).order_by(DJSession.created_at.desc()).limit(1)
                        )
                        active = r.scalar()
                        if active:
                            logger.info("[WS] refill check — session_id=%s played=%s total=%s", active.id, active.played_items, active.total_items)
                            await check_refill(s, active.id)

                elif msg_type == "error_report":
                    queue_item_id = data.get("queue_item_id")
                    reason = data.get("reason", "unknown")
                    logger.warning("[WS] error_report user_id=%s queue_item_id=%s reason=%s",
                                  user_id, queue_item_id, reason)
                    if queue_item_id:
                        from ..database import async_session as _as
                        from ..models.queue_item import QueueItem
                        from ..models.dj_session import DJSession
                        from sqlalchemy import select as _sel
                        async with _as() as s:
                            r = await s.execute(
                                _sel(QueueItem, DJSession)
                                .join(DJSession, QueueItem.session_id == DJSession.id)
                                .where(QueueItem.id == queue_item_id, DJSession.user_id == user_id)
                            )
                            row = r.first()
                            if row:
                                qi, active = row
                                qi.status = "error"
                                qi.error_message = str(reason)
                                await s.commit()
                                from ..routers.radio import _broadcast_queue
                                await _broadcast_queue(s, active.id)
                    await ws_manager.broadcast_to_user(user_id, {
                        "type": "error",
                        "queue_item_id": queue_item_id,
                        "message": reason,
                    })

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected — user_id=%s total_users=%s", user_id, ws_manager.user_count)
        ws_manager.disconnect(ws)
