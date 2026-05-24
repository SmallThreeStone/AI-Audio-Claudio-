from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    from .models import user, playlist, song, playlist_song, dj_session, queue_item, listening_history  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migrations: add columns that don't exist yet (SQLite-safe, ignore duplicates)
        _migrations = [
            "ALTER TABLE dj_sessions ADD COLUMN weather_summary TEXT",
        ]
        for sql in _migrations:
            try:
                await conn.run_sync(lambda c, s=sql: c.execute(s))
            except Exception:
                pass  # Column already exists


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
