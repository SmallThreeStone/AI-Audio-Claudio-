import datetime
from sqlalchemy import ForeignKey, DateTime, func, Table, Column, Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


playlist_song_table = Table(
    "playlist_songs",
    Base.metadata,
    Column("playlist_id", ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True),
    Column("song_id", ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True),
    Column("added_at", DateTime, server_default=func.now()),
)
