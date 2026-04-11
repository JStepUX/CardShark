"""
Tests for database_migrations: incremental migration system.

Verifies:
- Migration registry invariants (ordering, version derivation)
- Individual migration functions are idempotent and non-destructive
- Version tuple parsing
Uses a real in-memory SQLite engine (no mocks for DB operations).
"""
import pytest
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

import sys
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.database_migrations import (
    _migrate_add_is_default_column,
    _version_tuple,
    MIGRATIONS,
    CURRENT_SCHEMA_VERSION,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Migration registry invariants
# ---------------------------------------------------------------------------

class TestMigrationRegistry:
    def test_versions_are_monotonically_increasing(self):
        for i in range(1, len(MIGRATIONS)):
            prev = _version_tuple(MIGRATIONS[i - 1].version)
            curr = _version_tuple(MIGRATIONS[i].version)
            assert prev < curr, (
                f"MIGRATIONS[{i}] version {MIGRATIONS[i].version} must be "
                f"> MIGRATIONS[{i-1}] version {MIGRATIONS[i - 1].version}"
            )

    def test_current_version_matches_last_migration(self):
        assert CURRENT_SCHEMA_VERSION == MIGRATIONS[-1].version

    def test_all_migration_functions_are_callable(self):
        for m in MIGRATIONS:
            assert callable(m.fn), f"Migration {m.version} fn is not callable"


# ---------------------------------------------------------------------------
# Version tuple parsing
# ---------------------------------------------------------------------------

class TestVersionTuple:
    def test_simple(self):
        assert _version_tuple("2.7.0") == (2, 7, 0)

    def test_comparison(self):
        assert _version_tuple("2.7.0") < _version_tuple("2.7.1")
        assert _version_tuple("2.7.1") < _version_tuple("2.8.0")
        assert _version_tuple("2.7.1") < _version_tuple("3.0.0")

    def test_equal(self):
        assert _version_tuple("1.0.0") == _version_tuple("1.0.0")


# ---------------------------------------------------------------------------
# _migrate_add_is_default_column
# ---------------------------------------------------------------------------

class TestMigrateAddIsDefaultColumn:
    def test_adds_column_when_missing(self, engine_without_is_default):
        cols_before = _get_columns(engine_without_is_default)
        assert "is_default" not in cols_before

        _migrate_add_is_default_column(engine_without_is_default)

        cols_after = _get_columns(engine_without_is_default)
        assert "is_default" in cols_after

    def test_existing_rows_default_to_false(self, engine_without_is_default):
        _migrate_add_is_default_column(engine_without_is_default)

        with engine_without_is_default.connect() as conn:
            rows = conn.execute(text(
                "SELECT is_default FROM character_images"
            )).fetchall()
            assert all(row[0] == 0 for row in rows)

    def test_idempotent_when_column_exists(self, engine_with_is_default):
        cols_before = _get_columns(engine_with_is_default)
        assert "is_default" in cols_before

        _migrate_add_is_default_column(engine_with_is_default)

        cols_after = _get_columns(engine_with_is_default)
        assert "is_default" in cols_after

    def test_preserves_existing_data(self, engine_without_is_default):
        _migrate_add_is_default_column(engine_without_is_default)

        with engine_without_is_default.connect() as conn:
            rows = conn.execute(text(
                "SELECT character_uuid, filename FROM character_images ORDER BY display_order"
            )).fetchall()

        assert len(rows) == 2
        assert rows[0] == ("uuid-1", "img_a.png")
        assert rows[1] == ("uuid-1", "img_b.png")

    def test_double_run_is_safe(self, engine_without_is_default):
        _migrate_add_is_default_column(engine_without_is_default)
        _migrate_add_is_default_column(engine_without_is_default)

        cols = _get_columns(engine_without_is_default)
        assert "is_default" in cols
