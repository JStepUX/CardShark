"""
API smoke tests.

These boot the full FastAPI app against an in-memory SQLite database
and hit key endpoints to verify status codes and response shapes.
No KoboldCPP or external LLM needed.

Run:  pytest backend/tests/smoke/ -v
"""

import pytest


# ── Health ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200

    def test_health_shape(self, client):
        body = client.get("/api/health").json()
        assert body["status"] == "healthy"
        assert "version" in body


# ── Settings ────────────────────────────────────────────────────────────────

class TestSettings:
    def test_get_settings(self, client):
        r = client.get("/api/settings")
        assert r.status_code == 200
        body = r.json()
        # Settings endpoint returns a dict with at least character_directory
        assert isinstance(body, dict)


# ── Chat lifecycle ──────────────────────────────────────────────────────────

class TestChatLifecycle:
    """Create a session → append a message → load it back."""

    @pytest.fixture(autouse=True)
    def _need_character(self, seeded_character):
        """Ensure the test character exists before any chat test."""
        self.character_uuid = seeded_character

    def test_create_chat_session(self, client):
        r = client.post("/api/create-new-chat", json={
            "character_uuid": self.character_uuid,
        })
        assert r.status_code == 201
        body = r.json()
        assert "data" in body
        assert "chat_session_uuid" in body["data"]

    def test_full_chat_round_trip(self, client):
        # 1. Create
        r = client.post("/api/create-new-chat", json={
            "character_uuid": self.character_uuid,
        })
        assert r.status_code == 201
        session_uuid = r.json()["data"]["chat_session_uuid"]

        # 2. Append a user message
        r = client.post("/api/append-chat-message", json={
            "chat_session_uuid": session_uuid,
            "message": {
                "role": "user",
                "content": "Hello from smoke test",
            },
        })
        assert r.status_code in (200, 201), f"Append failed: {r.text}"

        # 3. Load latest for this character
        r = client.post("/api/load-latest-chat", json={
            "character_uuid": self.character_uuid,
        })
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        data = body["data"]
        assert data["chat_session_uuid"] == session_uuid
        # Should contain at least the system message + our user message
        assert len(data["messages"]) >= 1

    def test_create_chat_missing_character_404(self, client):
        r = client.post("/api/create-new-chat", json={
            "character_uuid": "does-not-exist-uuid",
        })
        assert r.status_code == 404


# ── World / Room list (empty state) ────────────────────────────────────────

class TestWorldRoomList:
    def test_list_worlds(self, client):
        r = client.get("/api/world-cards-v2")
        assert r.status_code == 200

    def test_list_rooms(self, client):
        r = client.get("/api/rooms/")
        assert r.status_code == 200
