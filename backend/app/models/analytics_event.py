import datetime
from sqlalchemy import BigInteger, String, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    event_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payload: Mapped[str | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
