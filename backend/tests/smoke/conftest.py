"""
Smoke test fixtures: boot the full FastAPI app with in-memory SQLite.

All file-system side effects (character sync, background deploy, etc.) are
patched to no-ops.  The real settings.json is loaded (harmless read-only),
but database operations go to an in-memory SQLite engine so the real
cardshark.sqlite is never touched.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure project root on path (same as root conftest)
project_root = Path(__file__).resolve().parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.database import Base
import backend.database as db_module
import backend.sql_models  # noqa: F401 — register all ORM models


# ---------------------------------------------------------------------------
# Session-scoped engine: one in-memory DB shared by all smoke tests
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def smoke_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="session")
def smoke_session_factory(smoke_engine):
    return sessionmaker(bind=smoke_engine, autocommit=False, autoflush=False)


# ---------------------------------------------------------------------------
# TestClient: boots the app once per test session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def client(smoke_engine, smoke_session_factory):
    """
    Yield a ``TestClient`` wired to an in-memory DB.

    Module-level and lifespan side effects in ``backend.main`` are handled:
      * database engine / SessionLocal / init_db  → in-memory SQLite
      * CharacterSyncService.sync_characters      → no-op
      * CharacterImageHandler.sync_from_disk      → no-op
      * UserProfileService.sync_users_directory    → no-op
      * BackgroundHandler.initialize_default_backgrounds → no-op
      * _deploy_bundled_defaults                   → no-op
    """
    from fastapi.testclient import TestClient

    # --- 1. Save originals so we can restore after the session ----------
    orig_engine = db_module.engine
    orig_session_local = db_module.SessionLocal
    orig_init_db = db_module.init_db
    orig_get_db = db_module.get_db          # the function object endpoints captured

    # --- 2. Patch the database module ------------------------------------
    db_module.engine = smoke_engine
    db_module.SessionLocal = smoke_session_factory

    def _test_init_db():
        Base.metadata.create_all(bind=smoke_engine)
    db_module.init_db = _test_init_db

    def _test_get_db():
        session = smoke_session_factory()
        try:
            yield session
        finally:
            session.close()
    db_module.get_db = _test_get_db

    # --- 3. Patch file-system side effects -------------------------------
    #  Class-method patches must be in place BEFORE importing backend.main
    #  so that module-level code (BackgroundHandler.initialize_default_backgrounds)
    #  and lifespan code (sync operations) see the mocks.
    patches = [
        patch(
            "backend.background_handler.BackgroundHandler.initialize_default_backgrounds"
        ),
        patch(
            "backend.services.character_sync_service.CharacterSyncService.sync_characters"
        ),
        patch(
            "backend.handlers.character_image_handler.CharacterImageHandler.sync_from_disk"
        ),
        patch(
            "backend.services.user_profile_service.UserProfileService.sync_users_directory"
        ),
    ]
    for p in patches:
        p.start()

    # --- 4. Import the app (triggers module-level setup) -----------------
    from backend.main import app

    # _deploy_bundled_defaults is a module-level function in main; patch it
    # on the already-imported module so the lifespan sees the mock.
    deploy_patch = patch.object(
        sys.modules["backend.main"], "_deploy_bundled_defaults", new=lambda *a, **kw: None
    )
    deploy_patch.start()
    patches.append(deploy_patch)

    # --- 5. Override get_db via FastAPI dependency system -----------------
    #  Endpoints captured the *original* get_db via ``from backend.database import get_db``.
    #  ``dependency_overrides`` maps original → replacement.
    app.dependency_overrides[orig_get_db] = _test_get_db

    # --- 6. Start TestClient (triggers lifespan) -------------------------
    with TestClient(app, raise_server_exceptions=True) as tc:
        yield tc

    # --- 7. Teardown -----------------------------------------------------
    app.dependency_overrides.clear()
    for p in reversed(patches):
        p.stop()
    db_module.engine = orig_engine
    db_module.SessionLocal = orig_session_local
    db_module.init_db = orig_init_db
    db_module.get_db = orig_get_db


# ---------------------------------------------------------------------------
# Seed data helpers
# ---------------------------------------------------------------------------

TEST_CHARACTER_UUID = "smoke-test-char-0001"
TEST_CHARACTER_NAME = "Smoke Test Character"


@pytest.fixture(scope="session")
def seeded_character(smoke_session_factory):
    """Insert a minimal character row so chat endpoints have something to reference."""
    session = smoke_session_factory()
    try:
        from backend.sql_models import Character
        existing = session.get(Character, TEST_CHARACTER_UUID)
        if not existing:
            session.add(Character(
                character_uuid=TEST_CHARACTER_UUID,
                name=TEST_CHARACTER_NAME,
                description="A character that exists only in smoke tests.",
                png_file_path="smoke_test_nonexistent.png",
            ))
            session.commit()
    finally:
        session.close()
    return TEST_CHARACTER_UUID
