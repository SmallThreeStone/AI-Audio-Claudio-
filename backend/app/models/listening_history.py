import datetime
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ListeningHistory(Base):
    __tablename__ = "listening_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"))
    queue_item_id: Mapped[int | None] = mapped_column(Integer)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("dj_sessions.id", ondelete="SET NULL"))
    event: Mapped[str] = mapped_column(String(20), nullable=False)  # started, completed, skipped
    position_seconds: Mapped[float | None] = mapped_column(Float)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    completion_rate: Mapped[float | None] = mapped_column(Float)  # 0.0-1.0, null for 'started'
    listened_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
