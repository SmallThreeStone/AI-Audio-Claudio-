import datetime
from sqlalchemy import BigInteger, Integer, String, Text, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    netease_song_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(512))
    artist: Mapped[str | None] = mapped_column(String(512))
    album: Mapped[str | None] = mapped_column(String(512))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    cover_url: Mapped[str | None] = mapped_column(Text)
    genre: Mapped[str | None] = mapped_column(String(128))
    mood_tags: Mapped[str | None] = mapped_column(Text)  # JSON array
    bpm: Mapped[int | None] = mapped_column(Integer)
    popularity: Mapped[int | None] = mapped_column(Integer)
    has_playable_url: Mapped[bool] = mapped_column(Boolean, default=False)
    last_url_fetch: Mapped[datetime.datetime | None] = mapped_column(DateTime)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    dislike_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    playlists = relationship("Playlist", secondary="playlist_songs", back_populates="songs")
