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

        def _run_migrations(sync_conn):
            """Check column existence before ALTER TABLE to avoid silent failures."""
            migrations = [
                ("dj_sessions", "weather_summary", "ALTER TABLE dj_sessions ADD COLUMN weather_summary TEXT"),
                ("users", "google_token_json", "ALTER TABLE users ADD COLUMN google_token_json TEXT"),
            ]
            for table, column, sql in migrations:
                info = sync_conn.exec_driver_sql(f"PRAGMA table_info({table})")
                columns = [row[1] for row in info]
                if column not in columns:
                    sync_conn.exec_driver_sql(sql)

        await conn.run_sync(_run_migrations)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
