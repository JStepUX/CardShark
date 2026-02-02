# backend/tests/test_world_chat_endpoints.py
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock

# Import the router from the module we are testing
from backend.world_chat_endpoints import router as world_chat_router
from backend.handlers.world_card_chat_handler import WorldCardChatHandler
from backend.log_manager import LogManager
from backend.dependencies import get_logger_dependency, get_world_card_chat_handler
from backend.error_handlers import register_exception_handlers


@pytest.fixture
def mock_logger():
    """Create a mock logger."""
    mock = MagicMock(spec=LogManager)
    mock.log_step = MagicMock()
    mock.log_warning = MagicMock()
    mock.log_error = MagicMock()
    return mock


@pytest.fixture
def mock_world_chat_handler():
    """Create a mock world chat handler."""
    mock = MagicMock(spec=WorldCardChatHandler)
    mock.list_chats = MagicMock()
    mock.get_chat = MagicMock()
    mock.save_chat = MagicMock()
    mock.create_chat = MagicMock()
    return mock


@pytest.fixture
def app(mock_logger, mock_world_chat_handler):
    """Create a FastAPI app with mocked dependencies for each test."""
    test_app = FastAPI()
    test_app.include_router(world_chat_router)

    # Register exception handlers
    register_exception_handlers(test_app)

    # Override dependencies
    test_app.dependency_overrides[get_logger_dependency] = lambda: mock_logger
    test_app.dependency_overrides[get_world_card_chat_handler] = lambda: mock_world_chat_handler

    return test_app


@pytest.fixture
def client(app):
    """Create a test client."""
    with TestClient(app) as c:
        yield c


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
    assert json_response["data"]["chat"] == latest_chat_data
    mock_world_chat_handler.list_chats.assert_called_once_with(world_name)
    mock_world_chat_handler.get_chat.assert_called_once_with(world_name, chat_id)


def test_get_latest_world_chat_no_chats_found(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "empty_world"
    mock_world_chat_handler.list_chats.return_value = []

    response = client.get(f"/api/world-chat/{world_name}/latest")

    assert response.status_code == 404
    json_response = response.json()
    assert json_response["success"] is False


def test_get_latest_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "error_world"
    mock_world_chat_handler.list_chats.side_effect = Exception("Handler error")

    response = client.get(f"/api/world-chat/{world_name}/latest")

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False


# --- Tests for POST /api/world-chat/{world_name}/save ---

def test_save_world_chat_success_existing_id(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "save_world_existing"
    chat_id = "existing_chat_789"
    chat_data = {"metadata": {"chat_id": chat_id}, "messages": [{"text": "Updating this"}]}
    mock_world_chat_handler.save_chat.return_value = True

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    assert response.status_code == 200
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["data"]["chat_id"] == chat_id
    mock_world_chat_handler.save_chat.assert_called_once_with(world_name, chat_id, chat_data)


def test_save_world_chat_failure(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "fail_save_world"
    chat_id = "fail_chat_id"
    chat_data = {"metadata": {"chat_id": chat_id}, "messages": [{"text": "This will fail"}]}
    mock_world_chat_handler.save_chat.return_value = False

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    # ValidationException returns 422 via FastAPI's exception handlers
    assert response.status_code in [400, 422]
    json_response = response.json()
    assert json_response["success"] is False


def test_save_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_save_world"
    chat_data = {"messages": [{"text": "Exception during save"}]}
    mock_world_chat_handler.save_chat.side_effect = Exception("DB error")

    response = client.post(f"/api/world-chat/{world_name}/save", json=chat_data)

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False


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
    assert json_response["data"]["chat"] == chat_data
    mock_world_chat_handler.get_chat.assert_called_once_with(world_name, chat_id)


def test_get_world_chat_not_found(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "no_chat_world"
    chat_id = "non_existent_chat"
    mock_world_chat_handler.get_chat.return_value = None

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 404
    json_response = response.json()
    assert json_response["success"] is False


def test_get_world_chat_value_error(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "value_error_world"
    chat_id = "value_error_chat"
    error_message = "Specific value error from handler"
    mock_world_chat_handler.get_chat.side_effect = ValueError(error_message)

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 404
    json_response = response.json()
    assert json_response["success"] is False


def test_get_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_get_world"
    chat_id = "exception_chat"
    mock_world_chat_handler.get_chat.side_effect = Exception("Generic handler error")

    response = client.get(f"/api/world-chat/{world_name}/{chat_id}")

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False


# --- Tests for POST /api/world-chat/{world_name}/create ---

def test_create_world_chat_success_with_data(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "create_world"
    request_data = {"title": "New Adventure", "location_id": "loc_123"}
    created_chat_data = {"id": "new_chat_xyz", "title": "New Adventure", "location_id": "loc_123", "messages": []}
    mock_world_chat_handler.create_chat.return_value = created_chat_data

    response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

    assert response.status_code == 200  # Endpoint returns 200, not 201
    json_response = response.json()
    assert json_response["success"] is True
    assert json_response["data"]["chat"] == created_chat_data
    assert json_response["data"]["chat_id"] == created_chat_data["id"]
    mock_world_chat_handler.create_chat.assert_called_once_with(world_name, request_data["title"], request_data["location_id"])


def test_create_world_chat_handler_exception(client: TestClient, mock_world_chat_handler: MagicMock, mock_logger: MagicMock):
    world_name = "exception_create_world"
    request_data = {"title": "Error Prone Chat"}
    mock_world_chat_handler.create_chat.side_effect = Exception("Creation failed")

    response = client.post(f"/api/world-chat/{world_name}/create", json=request_data)

    assert response.status_code == 500
    json_response = response.json()
    assert json_response["success"] is False
