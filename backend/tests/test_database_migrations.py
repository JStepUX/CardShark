"""
Tests for database_migrations._migrate_add_is_default_column.

Verifies the ALTER TABLE migration is idempotent and non-destructive.
Uses a real in-memory SQLite engine (no mocks for DB operations).
"""
import pytest
from pathlib import Path
from sqlalchemy import create_engine, text, Column, Integer, String
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import StaticPool
from unittest.mock import patch

import sys
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


class _Base(DeclarativeBase):
    pass


@pytest.fixture
def engine_without_is_default():
    """
    In-memory SQLite engine with a character_images table that deliberately
    lacks the is_default column — simulating a pre-migration database.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE character_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_uuid TEXT NOT NULL,
                filename TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("""
            INSERT INTO character_images (character_uuid, filename, display_order)
            VALUES ('uuid-1', 'img_a.png', 0), ('uuid-1', 'img_b.png', 1)
        """))
        conn.commit()
    return engine


@pytest.fixture
def engine_with_is_default():
    """
    In-memory SQLite engine where is_default already exists.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE character_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_uuid TEXT NOT NULL,
                filename TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_default BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
    return engine


def _get_columns(engine):
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(character_images)")).fetchall()
        return {row[1]: row for row in rows}


class TestMigrateAddIsDefaultColumn:
    def test_adds_column_when_missing(self, engine_without_is_default):
        cols_before = _get_columns(engine_without_is_default)
        assert "is_default" not in cols_before

        from backend.database_migrations import _migrate_add_is_default_column
        with patch("backend.database.engine", engine_without_is_default):
            _migrate_add_is_default_column()

        cols_after = _get_columns(engine_without_is_default)
        assert "is_default" in cols_after

    def test_existing_rows_default_to_false(self, engine_without_is_default):
        from backend.database_migrations import _migrate_add_is_default_column
        with patch("backend.database.engine", engine_without_is_default):
            _migrate_add_is_default_column()

        with engine_without_is_default.connect() as conn:
            rows = conn.execute(text(
                "SELECT is_default FROM character_images"
            )).fetchall()
            assert all(row[0] == 0 for row in rows)

    def test_idempotent_when_column_exists(self, engine_with_is_default):
        cols_before = _get_columns(engine_with_is_default)
        assert "is_default" in cols_before

        from backend.database_migrations import _migrate_add_is_default_column
        with patch("backend.database.engine", engine_with_is_default):
            _migrate_add_is_default_column()

        cols_after = _get_columns(engine_with_is_default)
        assert "is_default" in cols_after

    def test_preserves_existing_data(self, engine_without_is_default):
        from backend.database_migrations import _migrate_add_is_default_column
        with patch("backend.database.engine", engine_without_is_default):
            _migrate_add_is_default_column()

        with engine_without_is_default.connect() as conn:
            rows = conn.execute(text(
                "SELECT character_uuid, filename FROM character_images ORDER BY display_order"
            )).fetchall()

        assert len(rows) == 2
        assert rows[0] == ("uuid-1", "img_a.png")
        assert rows[1] == ("uuid-1", "img_b.png")
