import datetime
from sqlalchemy import Integer, BigInteger, DateTime, func, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class NeteaseListening(Base):
    """Imported NetEase Cloud Music all-time listening stats per song.

    Source: sidecar /user/record?type=1 (all-time data).
    Provides volume signal (play counts) to complement radio's context signal.
    """

    __tablename__ = "netease_listening"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"))
    netease_song_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    play_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[int | None] = mapped_column(Integer)  # NetEase's internal score (0-100)
    imported_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
