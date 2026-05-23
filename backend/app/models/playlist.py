import datetime
from sqlalchemy import BigInteger, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Playlist(Base):
    __tablename__ = "playlists"
    __table_args__ = (
        UniqueConstraint("user_id", "netease_playlist_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    netease_playlist_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(256))
    description: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(Text)
    song_count: Mapped[int] = mapped_column(Integer, default=0)
    is_liked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    songs = relationship("Song", secondary="playlist_songs", back_populates="playlists")
