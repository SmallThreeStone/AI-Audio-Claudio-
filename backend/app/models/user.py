import datetime
from sqlalchemy import BigInteger, String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    netease_uid: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    nickname: Mapped[str | None] = mapped_column(String(128))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    cookies_json: Mapped[str | None] = mapped_column(Text)
    login_status: Mapped[str] = mapped_column(String(20), default="logged_out")
    qr_key: Mapped[str | None] = mapped_column(String(64))
    google_token_json: Mapped[str | None] = mapped_column(Text)
    tts_provider: Mapped[str] = mapped_column(String(20), default="edge")
    role: Mapped[str] = mapped_column(String(20), default="user")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
