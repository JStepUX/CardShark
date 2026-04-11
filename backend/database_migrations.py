# backend/database_migrations.py
"""
Database initialization and incremental migration handling.

Design Philosophy:
- Files (PNG, JSON) are the source of truth for portable data
- Database stores both rebuildable indexes AND non-rebuildable user data
  (chat_sessions, chat_messages, world_user_progress, adventure_log_entries)
- Schema changes use incremental migrations, never nuke-and-rebuild
- Fresh installs use Base.metadata.create_all() and skip migrations
- All migration functions are idempotent (safe to re-run)

Adding a migration:
1. Write an idempotent function that takes a SQLAlchemy Engine
2. Append a Migration entry to MIGRATIONS with the next version number
3. CURRENT_SCHEMA_VERSION updates automatically
"""
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy import Column, String, DateTime, text, Table, MetaData
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Migration functions — define before MIGRATIONS so the list can reference them
# ---------------------------------------------------------------------------

def _migrate_add_is_default_column(engine: Engine) -> None:
    """Add is_default column to character_images if it doesn't exist yet."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(character_images)"))
        columns = [row[1] for row in result.fetchall()]

        if not columns:
            # Table doesn't exist yet — create_all() runs after migrations
            logger.debug("Migration: character_images table absent, skipping (create_all will handle)")
            return

        if "is_default" not in columns:
            conn.execute(text(
                "ALTER TABLE character_images ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT 0"
            ))
            conn.commit()
            logger.info("Migration: added is_default column to character_images")
        else:
            logger.debug("Migration: is_default column already exists (idempotent skip)")


# ---------------------------------------------------------------------------
# Migration registry
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Migration:
    """A single schema migration step."""
    version: str
    description: str
    fn: Callable[[Engine], None]


# Ordered list — each entry brings the DB forward one step.
# Every fn receives a SQLAlchemy Engine and must be idempotent.
MIGRATIONS: list[Migration] = [
    Migration("2.7.1", "Add is_default column to character_images", _migrate_add_is_default_column),
]

# Derived from the registry so the two can never drift apart.
CURRENT_SCHEMA_VERSION = MIGRATIONS[-1].version if MIGRATIONS else "2.7.0"

# The schema that create_all() produced before incremental migrations existed.
# Databases at or below this version run all migrations from the start.
_BASE_VERSION = "2.7.0"


# ---------------------------------------------------------------------------
# Version helpers
# ---------------------------------------------------------------------------

def _version_tuple(v: str) -> tuple[int, ...]:
    """Convert '2.7.1' to (2, 7, 1) for ordered comparison."""
    return tuple(int(x) for x in v.split("."))


def get_database_path() -> Path:
    """Get the path to the database file."""
    from backend.database import PROJECT_ROOT, DATABASE_FILE_NAME
    return PROJECT_ROOT / DATABASE_FILE_NAME


def database_exists() -> bool:
    """Check if the database file exists."""
    return get_database_path().exists()


def get_database_version() -> str:
    """Get the current database schema version."""
    try:
        from backend.database import engine, SessionLocal

        metadata = MetaData()
        metadata.reflect(bind=engine)

        if "database_version" not in metadata.tables:
            return "0.0.0"

        with SessionLocal() as db:
            result = db.execute(text("SELECT version FROM database_version LIMIT 1"))
            row = result.fetchone()
            return row[0] if row else "0.0.0"
    except Exception as e:
        logger.warning(f"Could not read database version: {e}")
        return "0.0.0"


def set_database_version(version: str, description: str = None):
    """Set the database schema version (single-row upsert)."""
    try:
        from backend.database import engine, SessionLocal

        metadata = MetaData()
        Table(
            "database_version", metadata,
            Column("version", String, primary_key=True),
            Column("applied_at", DateTime, default=lambda: datetime.now(timezone.utc)),
            Column("description", String, nullable=True),
        )
        metadata.create_all(engine)

        with SessionLocal() as db:
            db.execute(text("DELETE FROM database_version"))
            db.execute(text(
                "INSERT INTO database_version (version, applied_at, description) "
                "VALUES (:version, :applied_at, :description)"
            ), {
                "version": version,
                "applied_at": datetime.now(timezone.utc),
                "description": description,
            })
            db.commit()
            logger.info(f"Database version set to {version}")
    except Exception as e:
        logger.error(f"Failed to set database version: {e}")
        raise


# ---------------------------------------------------------------------------
# Database lifecycle
# ---------------------------------------------------------------------------

def delete_database():
    """Delete the existing database file."""
    from backend.database import engine

    db_path = get_database_path()
    if not db_path.exists():
        logger.info("No existing database to delete")
        return

    try:
        engine.dispose()
        os.remove(db_path)
        logger.info(f"Deleted old database: {db_path}")
    except Exception as e:
        logger.error(f"Failed to delete database: {e}")
        raise


def create_fresh_database():
    """Create a fresh database with all tables at the latest schema version."""
    from backend.database import Base, engine

    logger.info("Creating fresh database with all tables...")
    Base.metadata.create_all(bind=engine)
    set_database_version(CURRENT_SCHEMA_VERSION, "Fresh database creation")
    logger.info(f"Fresh database created at version {CURRENT_SCHEMA_VERSION}")


def init_db_with_migrations():
    """
    Initialize the database with incremental migrations.

    - No DB file        → create everything from models, stamp latest version
    - DB at "0.0.0"     → rebuild (predates non-rebuildable data)
    - DB at known version → run only pending migrations, then create_all()
                           for any new model-defined tables
    """
    try:
        if not database_exists():
            logger.info("No database found — creating fresh")
            create_fresh_database()
            return

        db_version = get_database_version()

        if db_version == "0.0.0":
            logger.warning("Database exists but has no version — rebuilding")
            delete_database()
            create_fresh_database()
            return

        # Run pending migrations in order
        from backend.database import engine, Base
        db_ver = _version_tuple(db_version)
        pending = [m for m in MIGRATIONS if _version_tuple(m.version) > db_ver]

        if pending:
            for migration in pending:
                logger.info(f"Migrating to {migration.version}: {migration.description}")
                migration.fn(engine)
                set_database_version(migration.version, migration.description)
                logger.info(f"Migration to {migration.version} complete")
        else:
            logger.info(f"Database is up to date (version {db_version})")

        # Add any new model-defined tables (additive only, won't alter existing)
        Base.metadata.create_all(bind=engine)

    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
