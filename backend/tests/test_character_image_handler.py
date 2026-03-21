"""
Tests for CharacterImageHandler — set_default_image / clear_default_image logic.

Uses in-memory SQLite with real ORM models (no mocks for DB operations).
"""
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.database import Base
from backend.sql_models import CharacterImage
from backend.handlers.character_image_handler import CharacterImageHandler


@pytest.fixture
def db_session():
    """In-memory SQLite session with tables created."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def handler(tmp_path):
    """CharacterImageHandler with a temp base directory."""
    logger = MagicMock()
    logger.log_step = MagicMock()
    logger.log_warning = MagicMock()
    logger.log_error = MagicMock()

    with patch(
        "backend.handlers.character_image_handler.get_application_base_path",
        return_value=tmp_path,
    ):
        h = CharacterImageHandler(logger)
    return h


CHAR_UUID = "test-char-uuid-001"


def _seed_images(db_session, handler, char_uuid, count=3):
    """Insert N image records + dummy files on disk."""
    char_dir = handler.base_dir / char_uuid
    char_dir.mkdir(parents=True, exist_ok=True)

    images = []
    for i in range(count):
        fname = f"img_{i}.png"
        (char_dir / fname).write_bytes(b"\x89PNG\r\n\x1a\n" + bytes(64))
        rec = CharacterImage(
            character_uuid=char_uuid,
            filename=fname,
            display_order=i,
            is_default=False,
        )
        db_session.add(rec)
        images.append(rec)

    db_session.commit()
    for img in images:
        db_session.refresh(img)
    return images


class TestSetDefaultImage:
    def test_sets_default_flag(self, db_session, handler):
        imgs = _seed_images(db_session, handler, CHAR_UUID)
        result = handler.set_default_image(db_session, CHAR_UUID, imgs[1].filename)

        assert result is True
        db_session.refresh(imgs[1])
        assert imgs[1].is_default is True

    def test_clears_previous_default(self, db_session, handler):
        imgs = _seed_images(db_session, handler, CHAR_UUID)
        handler.set_default_image(db_session, CHAR_UUID, imgs[0].filename)
        handler.set_default_image(db_session, CHAR_UUID, imgs[2].filename)

        for img in imgs:
            db_session.refresh(img)

        assert imgs[0].is_default is False
        assert imgs[2].is_default is True

    def test_nonexistent_filename_returns_false(self, db_session, handler):
        _seed_images(db_session, handler, CHAR_UUID)
        result = handler.set_default_image(db_session, CHAR_UUID, "no_such_file.png")
        assert result is False

    def test_only_one_default_at_a_time(self, db_session, handler):
        imgs = _seed_images(db_session, handler, CHAR_UUID, count=5)
        for img in imgs:
            handler.set_default_image(db_session, CHAR_UUID, img.filename)

        defaults = (
            db_session.query(CharacterImage)
            .filter(
                CharacterImage.character_uuid == CHAR_UUID,
                CharacterImage.is_default == True,
            )
            .all()
        )
        assert len(defaults) == 1
        assert defaults[0].id == imgs[-1].id


class TestClearDefaultImage:
    def test_clears_default(self, db_session, handler):
        imgs = _seed_images(db_session, handler, CHAR_UUID)
        handler.set_default_image(db_session, CHAR_UUID, imgs[1].filename)
        result = handler.clear_default_image(db_session, CHAR_UUID)

        assert result is True
        for img in imgs:
            db_session.refresh(img)
            assert img.is_default is False

    def test_clear_when_none_set_is_noop(self, db_session, handler):
        _seed_images(db_session, handler, CHAR_UUID)
        result = handler.clear_default_image(db_session, CHAR_UUID)
        assert result is True


class TestListImagesIncludesDefault:
    def test_is_default_in_response(self, db_session, handler):
        imgs = _seed_images(db_session, handler, CHAR_UUID)
        handler.set_default_image(db_session, CHAR_UUID, imgs[1].filename)

        result = handler.list_images(db_session, CHAR_UUID)
        defaults = [r for r in result if r["is_default"]]
        assert len(defaults) == 1
        assert defaults[0]["filename"] == imgs[1].filename

    def test_no_default_when_cleared(self, db_session, handler):
        _seed_images(db_session, handler, CHAR_UUID)
        result = handler.list_images(db_session, CHAR_UUID)
        assert all(r["is_default"] is False for r in result)
