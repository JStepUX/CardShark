"""
Tests for chat session pruning in get_recent_chat_sessions.

Verifies that the age threshold prevents brand-new sessions from being pruned
(the bug where navigating to History mid-creation deleted the session).
"""
import pytest
from pathlib import Path
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import sys
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.database import Base
from backend.sql_models import ChatSession, Character
from backend.services.chat_service import get_recent_chat_sessions


CHAR_UUID = "pruning-test-char"


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed a character so the outer join has data
    session.add(Character(
        character_uuid=CHAR_UUID,
        name="Test Char",
        description="",
        png_file_path="fake.png",
    ))
    session.commit()
    yield session
    session.close()


def _make_session(db, uuid_suffix, *, message_count, age_hours=0):
    """Helper to insert a chat session with a given age and message count."""
    s = ChatSession(
        chat_session_uuid=f"sess-{uuid_suffix}",
        character_uuid=CHAR_UUID,
        user_uuid="user-1",
        title=f"Session {uuid_suffix}",
        start_time=datetime.utcnow() - timedelta(hours=age_hours),
        message_count=message_count,
    )
    db.add(s)
    db.commit()
    return s


class TestPruningAgeThreshold:
    def test_new_empty_session_not_pruned(self, db_session):
        """A brand-new session (0 messages, 0 age) must survive pruning."""
        _make_session(db_session, "new", message_count=0, age_hours=0)
        result = get_recent_chat_sessions(db_session, limit=50)

        uuids = [r["chat_session_uuid"] for r in result]
        assert "sess-new" in uuids

    def test_new_greeting_only_session_not_pruned(self, db_session):
        """A session with just the greeting (1 msg) < 1hr old must survive."""
        _make_session(db_session, "greeting", message_count=1, age_hours=0)
        result = get_recent_chat_sessions(db_session, limit=50)

        uuids = [r["chat_session_uuid"] for r in result]
        assert "sess-greeting" in uuids

    def test_old_empty_session_is_pruned(self, db_session):
        """An abandoned session (0 messages, 2hrs old) should be pruned."""
        _make_session(db_session, "abandoned", message_count=0, age_hours=2)
        result = get_recent_chat_sessions(db_session, limit=50)

        uuids = [r["chat_session_uuid"] for r in result]
        assert "sess-abandoned" not in uuids

    def test_old_greeting_only_session_is_pruned(self, db_session):
        """An old session with just a greeting (1 msg, 3hrs old) should be pruned."""
        _make_session(db_session, "old-greeting", message_count=1, age_hours=3)
        result = get_recent_chat_sessions(db_session, limit=50)

        uuids = [r["chat_session_uuid"] for r in result]
        assert "sess-old-greeting" not in uuids

    def test_session_with_messages_never_pruned(self, db_session):
        """A session with real messages is never pruned, regardless of age."""
        _make_session(db_session, "active", message_count=5, age_hours=48)
        result = get_recent_chat_sessions(db_session, limit=50)

        uuids = [r["chat_session_uuid"] for r in result]
        assert "sess-active" in uuids
