# backend/tests/test_world_chat_endpoints.py
import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import time

# Import the router from the module we are testing
from backend.world_chat_endpoints import router as world_chat_router
from backend.world_chat_endpoints import WorldCardChatHandler, LogManager # For patching

# Create a FastAPI instance and include the router
app = FastAPI()
app.include_router(world_chat_router)

@pytest.fixture
def client(): # Changed to a synchronous fixture
    with TestClient(app) as c:
        yield c

@pytest.fixture
def mock_logger():
    with patch("backend.world_chat_endpoints.logger", spec=LogManager) as mock_log:
        mock_log.log_step = MagicMock()
        mock_log.log_warning = MagicMock()
        mock_log.log_error = MagicMock()
        yield mock_log

@pytest.fixture
def mock_world_chat_handler():
    with patch("backend.world_chat_endpoints.world_chat_handler", spec=WorldCardChatHandler) as mock_handler:
        # Common methods to mock
        mock_handler.list_chats = MagicMock()
        mock_handler.get_chat = MagicMock()
        mock_handler.save_chat = MagicMock()
        mock_handler.create_chat = MagicMock()
        yield mock_handler

# Helper to simulate request object for endpoints that need it
class MockRequest:
    async def json(self):
        return self._json_data

    def __init__(self, json_data):
        self._json_data = json_data

# --- Tests for GET /api/world-chat/{world_name}/latest ---

def test_get_latest_world_chat_success(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "test_world"
    chat_id = "chat_123"
    latest_chat_data = {"id": chat_id, "messages": [{"text": "Hello"}]}
    mock_world_chat_handler.list_chats.return_value = [{"id": chat_id, "name": "Chat 1"}]
    mock_world_chat_handler.get_chat.return_value = latest_chat_data

    response = client.get(f"/api/world-chat/{world_name}/latest")

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["chat"] == latest_chat_data
    mock_world_chat_handler.list_chats.assert_called_once_with(world_name)
    mock_world_chat_handler.get_chat.assert_called_once_with(world_name, chat_id)
    mock_logger.log_step.assert_any_call(f"Loading latest chat for world: {world_name}")

def test_get_latest_world_chat_invalid_world_name(client: TestClient, mock_logger: MagicMock):
    response = client.get("/api/world-chat/!@#$/latest")
    assert response.status_code == 404
    json_response = response.json()
    assert json_response.get("detail") == "Not Found"

def test_get_latest_world_chat_no_chats_found(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "empty_world"
    mock_world_chat_handler.list_chats.return_value = []

    response = client.get(f"/api/world-chat/{world_name}/latest")

    assert response.status_code == 404
    json_response = response.json()
    assert json_response["success"] is False
    assert f"No chats found for world '{world_name}'" in json_response["message"]
    mock_logger.log_warning.assert_called_once_with(f"No chats found for world '{world_name}'")

def test_get_latest_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "error_world"
    mock_world_chat_handler.list_chats.side_effect = Exception("Handler error")

    response = client.get(f"/api/world-chat/{world_name}/latest")

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert "Failed to get latest chat: Handler error" in json_response["message"]
    mock_logger.log_error.assert_any_call(f"Error getting latest chat for world '{world_name}': Handler error")

# --- Tests for POST /api/world-chat/{world_name}/save ---

def test_save_world_chat_success_new_id(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "save_world"
    chat_data = {"messages": [{"text": "Saving this"}]}
    mock_world_chat_handler.save_chat.return_value = True
    
    # Mock uuid.uuid4()
    mock_uuid = MagicMock()
    mock_uuid.hex = "randomhex123"
    with patch("uuid.uuid4", return_value=mock_uuid):
        response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    generated_chat_id = f"chat_{mock_uuid.hex[:8]}"
    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["message"] == f"Chat saved for world '{world_name}'"
    assert json_response["chat_id"] == generated_chat_id
    mock_world_chat_handler.save_chat.assert_called_once_with(world_name, generated_chat_id, chat_data)
    mock_logger.log_step.assert_any_call(f"Saving chat for world '{world_name}' with {len(chat_data.get('messages', []))} messages")
    mock_logger.log_step.assert_any_call(f"Generated new chat ID: {generated_chat_id}")

def test_save_world_chat_success_existing_id(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "save_world_existing"
    chat_id = "existing_chat_789"
    chat_data = {"metadata": {"chat_id": chat_id}, "messages": [{"text": "Updating this"}]}
    mock_world_chat_handler.save_chat.return_value = True

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["chat_id"] == chat_id
    mock_world_chat_handler.save_chat.assert_called_once_with(world_name, chat_id, chat_data)

def test_save_world_chat_invalid_world_name(client: TestClient, mock_logger: MagicMock):
    response = client.post("/api/world-chat/!@#$/save", json={"messages": []})
    assert response.status_code == 404
    json_response = response.json()
    assert json_response.get("detail") == "Not Found"

def test_save_world_chat_failure(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "fail_save_world"
    chat_id = "fail_chat_id"
    chat_data = {"metadata": {"chat_id": chat_id}, "messages": [{"text": "This will fail"}]}
    mock_world_chat_handler.save_chat.return_value = False

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert f"Failed to save chat for world '{world_name}'" in json_response["message"]

def test_save_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_save_world"
    chat_data = {"messages": [{"text": "Exception during save"}]}
    mock_world_chat_handler.save_chat.side_effect = Exception("DB error")

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert "Failed to save chat: DB error" in json_response["message"]
    mock_logger.log_error.assert_any_call(f"Error saving chat for world '{world_name}': DB error")


# --- Tests for GET /api/world-chat/{world_name}/{chat_id} ---

def test_get_world_chat_success(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "get_world"
    chat_id = "chat_abc"
    chat_data = {"id": chat_id, "messages": [{"text": "Specific chat"}]}
    mock_world_chat_handler.get_chat.return_value = chat_data

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["chat"] == chat_data
    mock_world_chat_handler.get_chat.assert_called_once_with(world_name, chat_id)

def test_get_world_chat_invalid_world_name(client: TestClient, mock_logger: MagicMock):
    response = client.get("/api/world-chat/!@#$/some_chat_id")
    assert response.status_code == 404
    json_response = response.json()
    assert json_response.get("detail") == "Not Found"

def test_get_world_chat_not_found(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "no_chat_world"
    chat_id = "non_existent_chat"
    mock_world_chat_handler.get_chat.return_value = None

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 404
    json_response = response.json()
    assert json_response["success"] is False
    assert f"Chat '{chat_id}' not found for world '{world_name}'" in json_response["message"]

def test_get_world_chat_value_error(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "value_error_world"
    chat_id = "value_error_chat"
    error_message = "Specific value error from handler"
    mock_world_chat_handler.get_chat.side_effect = ValueError(error_message)

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 404 # As per current implementation for ValueError
    json_response = response.json()
    assert json_response["success"] is False
    assert json_response["message"] == error_message

def test_get_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_get_world"
    chat_id = "exception_chat"
    mock_world_chat_handler.get_chat.side_effect = Exception("Generic handler error")

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert "Failed to get chat: Generic handler error" in json_response["message"]
    mock_logger.log_error.assert_any_call(f"Error getting chat '{chat_id}' for world '{world_name}': Generic handler error")

# --- Tests for POST /api/world-chat/{world_name}/create ---

def test_create_world_chat_success_with_data(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "create_world"
    request_data = {"title": "New Adventure", "location_id": "loc_123"}
    created_chat_data = {"id": "new_chat_xyz", "title": "New Adventure", "location_id": "loc_123", "messages": []}
    mock_world_chat_handler.create_chat.return_value = created_chat_data

    response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

    assert response.status_code == 201
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["chat"] == created_chat_data
    assert json_response["chat_id"] == created_chat_data["id"]
    mock_world_chat_handler.create_chat.assert_called_once_with(world_name, request_data["title"], request_data["location_id"])

def test_create_world_chat_success_default_title(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "create_world_default"
    request_data = {"location_id": "loc_456"} # No title
    
    # Mock time.strftime
    current_time_str = "2025-01-01"
    with patch("time.strftime", return_value=current_time_str) as mock_time:
        default_title = f"Chat {current_time_str}"
        created_chat_data = {"id": "new_chat_def", "title": default_title, "location_id": "loc_456", "messages": []}
        mock_world_chat_handler.create_chat.return_value = created_chat_data

        response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

        assert response.status_code == 201
        json_response = response.json()
        assert json_response["success"] is True
        assert json_response["chat"]["title"] == default_title
        mock_world_chat_handler.create_chat.assert_called_once_with(world_name, default_title, request_data["location_id"])
        mock_time.assert_called_once_with('%Y-%m-%d')


def test_create_world_chat_success_empty_data(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "create_world_empty"
    request_data = {} # Empty request
    
    current_time_str = "2025-01-02" # Different time for this test
    with patch("time.strftime", return_value=current_time_str) as mock_time:
        default_title = f"Chat {current_time_str}"
        default_location_id = ""
        created_chat_data = {"id": "new_chat_emp", "title": default_title, "location_id": default_location_id, "messages": []}
        mock_world_chat_handler.create_chat.return_value = created_chat_data

        response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

        assert response.status_code == 201
        json_response = response.json()
        assert json_response["success"] is True
        assert json_response["chat"]["title"] == default_title
        assert json_response["chat"]["location_id"] == default_location_id
        mock_world_chat_handler.create_chat.assert_called_once_with(world_name, default_title, default_location_id)

def test_create_world_chat_invalid_world_name(client: TestClient, mock_logger: MagicMock):
    response = client.post("/api/world-chat/!@#$/create", json={})
    assert response.status_code == 404
    json_response = response.json()
    assert json_response.get("detail") == "Not Found"

def test_create_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_create_world"
    request_data = {"title": "Error Prone Chat"}
    mock_world_chat_handler.create_chat.side_effect = Exception("Creation failed")

    response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
    assert "Failed to create chat: Creation failed" in json_response["message"]
    mock_logger.log_error.assert_any_call(f"Error creating chat for world '{world_name}': Creation failed")