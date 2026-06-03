from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..services.public_library_service import expand_ai_material

router = APIRouter(prefix="/api/ai-material", tags=["ai-material"])


class ExpandRequest(BaseModel):
    text: str
    limit: int = 12


@router.post("/expand")
async def expand_material(body: ExpandRequest, request: Request, session: AsyncSession = Depends(get_session)):
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return {"error": "Missing client identity", "found": 0, "added": 0, "songs": []}
    text = body.text.strip()
    if not text:
        return {"error": "请输入想找的歌、艺人或场景", "found": 0, "added": 0, "songs": []}
    return await expand_ai_material(session, user_id, text, min(max(body.limit, 1), 30))
