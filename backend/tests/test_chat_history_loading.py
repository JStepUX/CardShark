"""Tests for Phase 3: Backend loads chat history from SQLite for generation."""

import uuid
from datetime import datetime
from typing import List

import pytest
from sqlalchemy.orm import Session

from backend import sql_models
from backend.services.chat_service import (
    get_chat_messages_for_generation,
    get_chat_messages,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_session(db: Session, character_uuid: str = "char-1") -> str:
    """Create a chat session and return its UUID."""
    session_uuid = str(uuid.uuid4())
    db_session = sql_models.ChatSession(
        chat_session_uuid=session_uuid,
        character_uuid=character_uuid,
        start_time=datetime.utcnow(),
        message_count=0,
    )
    db.add(db_session)
    db.flush()
    return session_uuid


def _add_messages(
    db: Session,
    session_uuid: str,
    messages: List[dict],
) -> None:
    """Add messages to a session. Each dict: {role, content, status?, metadata_json?, sequence_number?}."""
    for i, msg in enumerate(messages):
        db_msg = sql_models.ChatMessage(
            message_id=str(uuid.uuid4()),
            chat_session_uuid=session_uuid,
            role=msg["role"],
            content=msg["content"],
            status=msg.get("status", "complete"),
            metadata_json=msg.get("metadata_json"),
            timestamp=datetime.utcnow(),
            sequence_number=msg.get("sequence_number", i),
        )
        db.add(db_msg)
    db.flush()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestGetChatMessagesForGeneration:
    """Tests for the Phase 3 helper that loads chat history for generation."""

    def test_basic_load(self, db_session: Session):
        """Loads user/assistant messages in order."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"},
            {"role": "assistant", "content": "I'm good."},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 4
        assert result[0] == {"role": "user", "content": "Hello"}
        assert result[1] == {"role": "assistant", "content": "Hi there!"}
        assert result[2] == {"role": "user", "content": "How are you?"}
        assert result[3] == {"role": "assistant", "content": "I'm good."}

    def test_filters_thinking_messages(self, db_session: Session):
        """Thinking-role messages are excluded."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "user", "content": "Hello"},
            {"role": "thinking", "content": "reasoning..."},
            {"role": "assistant", "content": "Hi!"},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 2
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"

    def test_filters_error_status(self, db_session: Session):
        """Messages with error status are excluded."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Error occurred", "status": "error"},
            {"role": "assistant", "content": "Actual response"},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 2
        assert result[0]["content"] == "Hello"
        assert result[1]["content"] == "Actual response"

    def test_filters_generating_status(self, db_session: Session):
        """Messages with generating status are excluded."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "", "status": "generating"},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 1
        assert result[0]["content"] == "Hello"

    def test_preserves_system_messages(self, db_session: Session):
        """System messages are included (only thinking is filtered)."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "system", "content": "System context"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 3
        assert result[0]["role"] == "system"

    def test_resolves_variations(self, db_session: Session):
        """When metadata_json has variations, uses the active variation."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "user", "content": "Hello"},
            {
                "role": "assistant",
                "content": "Original response",
                "metadata_json": {
                    "variations": ["Original response", "Better response", "Best response"],
                    "current_variation": 2,
                },
            },
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 2
        assert result[1]["content"] == "Best response"

    def test_variation_fallback_to_content(self, db_session: Session):
        """When variations exist but current_variation is missing, uses content field."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {
                "role": "assistant",
                "content": "Default content",
                "metadata_json": {
                    "variations": ["V1", "V2"],
                    # No current_variation key
                },
            },
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert result[0]["content"] == "Default content"

    def test_variation_out_of_bounds(self, db_session: Session):
        """When current_variation is out of bounds, uses content field."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {
                "role": "assistant",
                "content": "Fallback content",
                "metadata_json": {
                    "variations": ["V1"],
                    "current_variation": 5,  # Out of bounds
                },
            },
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert result[0]["content"] == "Fallback content"

    def test_empty_session(self, db_session: Session):
        """Empty session returns empty list."""
        sid = _create_session(db_session)

        result = get_chat_messages_for_generation(db_session, sid)

        assert result == []

    def test_nonexistent_session(self, db_session: Session):
        """Nonexistent session UUID returns empty list."""
        result = get_chat_messages_for_generation(db_session, "nonexistent-uuid")

        assert result == []

    def test_sequence_ordering(self, db_session: Session):
        """Messages are returned in sequence_number order."""
        sid = _create_session(db_session)
        # Insert out of order
        _add_messages(db_session, sid, [
            {"role": "assistant", "content": "Second", "sequence_number": 1},
            {"role": "user", "content": "First", "sequence_number": 0},
            {"role": "user", "content": "Third", "sequence_number": 2},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert [m["content"] for m in result] == ["First", "Second", "Third"]

    def test_session_isolation(self, db_session: Session):
        """Only messages from the requested session are returned."""
        sid1 = _create_session(db_session)
        sid2 = _create_session(db_session)

        _add_messages(db_session, sid1, [
            {"role": "user", "content": "Session 1 msg"},
        ])
        _add_messages(db_session, sid2, [
            {"role": "user", "content": "Session 2 msg"},
        ])

        result1 = get_chat_messages_for_generation(db_session, sid1)
        result2 = get_chat_messages_for_generation(db_session, sid2)

        assert len(result1) == 1
        assert result1[0]["content"] == "Session 1 msg"
        assert len(result2) == 1
        assert result2[0]["content"] == "Session 2 msg"

    def test_empty_content_handled(self, db_session: Session):
        """Empty string content is preserved (DB column is NOT NULL)."""
        sid = _create_session(db_session)
        _add_messages(db_session, sid, [
            {"role": "assistant", "content": ""},
        ])

        result = get_chat_messages_for_generation(db_session, sid)

        assert len(result) == 1
        assert result[0]["content"] == ""
