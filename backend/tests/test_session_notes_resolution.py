"""Tests for session notes resolution: DB value takes precedence over payload,
even when the DB value is an empty string (user intentionally cleared notes)."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from backend import sql_models


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_session(db: Session, session_notes=None) -> str:
    """Create a chat session with the given session_notes and return its UUID."""
    session_uuid = str(uuid.uuid4())
    db_session = sql_models.ChatSession(
        chat_session_uuid=session_uuid,
        character_uuid="char-test",
        start_time=datetime.utcnow(),
        message_count=0,
        session_notes=session_notes,
    )
    db.add(db_session)
    db.flush()
    return session_uuid


def _resolve_session_notes(db: Session, chat_session_uuid: str, payload_notes: str) -> str:
    """Mirrors the session notes resolution logic from api_handler.py stream_generate().

    This is the exact pattern from the fix: use None sentinel to distinguish
    'DB not queried' from 'DB returned empty string'.
    """
    db_session_notes = None  # None = not loaded; '' = intentionally cleared
    if chat_session_uuid:
        session_row = db.query(sql_models.ChatSession).filter(
            sql_models.ChatSession.chat_session_uuid == chat_session_uuid
        ).first()
        if session_row:
            db_session_notes = session_row.session_notes or ''

    # DB value takes precedence when successfully loaded (even if empty).
    # Only fall back to payload when DB lookup was skipped or failed.
    return db_session_notes if db_session_notes is not None else payload_notes


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSessionNotesResolution:
    """Verify that DB session notes take precedence over stale payload values."""

    def test_db_notes_override_payload(self, db_session: Session):
        """DB notes should be used even when payload has different value."""
        sid = _create_session(db_session, session_notes="DB notes")
        result = _resolve_session_notes(db_session, sid, payload_notes="stale payload notes")
        assert result == "DB notes"

    def test_empty_db_notes_not_overridden_by_payload(self, db_session: Session):
        """When user clears notes (DB stores ''), stale payload must NOT resurrect them.

        This is the P2 bug: the old `or` operator treated '' as falsy and
        fell through to the payload value.
        """
        sid = _create_session(db_session, session_notes="")
        result = _resolve_session_notes(db_session, sid, payload_notes="stale notes from frontend")
        assert result == ""

    def test_null_db_notes_treated_as_empty(self, db_session: Session):
        """When session_notes is NULL in DB (never set), resolve to '' not payload."""
        sid = _create_session(db_session, session_notes=None)
        result = _resolve_session_notes(db_session, sid, payload_notes="payload fallback")
        # NULL is coerced to '' by `or ''`, and the row was found, so db_session_notes = ''
        assert result == ""

    def test_no_session_uuid_falls_back_to_payload(self, db_session: Session):
        """When no chat_session_uuid is provided, payload notes are used."""
        result = _resolve_session_notes(db_session, "", payload_notes="payload notes")
        assert result == "payload notes"

    def test_nonexistent_session_falls_back_to_payload(self, db_session: Session):
        """When session UUID doesn't exist in DB, fall back to payload."""
        result = _resolve_session_notes(db_session, "nonexistent-uuid", payload_notes="fallback")
        assert result == "fallback"

    def test_no_session_no_payload_returns_empty(self, db_session: Session):
        """When neither DB nor payload has notes, result is empty string."""
        result = _resolve_session_notes(db_session, "", payload_notes="")
        assert result == ""
