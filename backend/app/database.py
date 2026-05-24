from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    from .models import user, playlist, song, playlist_song, dj_session, queue_item, listening_history, netease_listening  # noqa: F401
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

            # FK migration: listening_history.queue_item_id -> queue_items.id
            fk_info = sync_conn.exec_driver_sql("PRAGMA foreign_key_list(listening_history)")
            fk_columns = [row[3] for row in fk_info]  # column index 3 = "from" column name
            if "queue_item_id" not in fk_columns:
                sync_conn.exec_driver_sql("PRAGMA foreign_keys = OFF")
                # Null out orphaned queue_item_id values before adding FK
                valid_ids = {row[0] for row in sync_conn.exec_driver_sql("SELECT id FROM queue_items")}
                orphans = sync_conn.exec_driver_sql(
                    "SELECT id, queue_item_id FROM listening_history WHERE queue_item_id IS NOT NULL"
                )
                for row in orphans:
                    if row[1] not in valid_ids:
                        sync_conn.exec_driver_sql(
                            f"UPDATE listening_history SET queue_item_id = NULL WHERE id = {row[0]}"
                        )
                sync_conn.exec_driver_sql("""
                    CREATE TABLE listening_history_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
                        queue_item_id INTEGER REFERENCES queue_items(id) ON DELETE SET NULL,
                        session_id INTEGER REFERENCES dj_sessions(id) ON DELETE SET NULL,
                        event VARCHAR(20) NOT NULL,
                        position_seconds FLOAT,
                        duration_ms INTEGER,
                        completion_rate FLOAT,
                        listened_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                sync_conn.exec_driver_sql(
                    "INSERT INTO listening_history_new SELECT * FROM listening_history"
                )
                sync_conn.exec_driver_sql("DROP TABLE listening_history")
                sync_conn.exec_driver_sql(
                    "ALTER TABLE listening_history_new RENAME TO listening_history"
                )
                sync_conn.exec_driver_sql("PRAGMA foreign_keys = ON")

        await conn.run_sync(_run_migrations)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
