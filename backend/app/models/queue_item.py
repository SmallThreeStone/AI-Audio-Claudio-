import datetime
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class QueueItem(Base):
    __tablename__ = "queue_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("dj_sessions.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False)  # tts_intro, tts_bridge, tts_outro, song
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"))
    tts_text: Mapped[str | None] = mapped_column(Text)
    tts_voice: Mapped[str | None] = mapped_column(String(64))
    tts_audio_path: Mapped[str | None] = mapped_column(String(512))
    intro_text: Mapped[str | None] = mapped_column(Text)  # DJ intro for this song
    stream_url: Mapped[str | None] = mapped_column(Text)
    stream_url_expires: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    played_at: Mapped[datetime.datetime | None] = mapped_column(DateTime)
