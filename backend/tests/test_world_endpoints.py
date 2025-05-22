import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Assuming your PngMetadataHandler and WorldStateHandler are in these locations
# Adjust imports based on your actual project structure
from backend.png_metadata_handler import PngMetadataHandler
# Use WorldStateHandler as per world_endpoints.py for the spec
from backend.handlers.world_state_handler import WorldStateHandler
from backend.log_manager import LogManager
# Import the FastAPI app instance
from backend.main import app
# Import the dependency getters to override them
from backend.world_endpoints import get_world_state_handler, get_logger


# Mock data for WorldStateHandler
MOCK_WORLDS_DATA = [
    {"name": "World Alpha", "image": "alpha.png", "description": "Description A"},
    {"name": "World Beta", "image": "beta.png", "description": "Description B"},
]

@pytest.fixture
def mock_png_handler():
    handler = MagicMock(spec=PngMetadataHandler)
    # This mock_png_handler might not be directly used by list_worlds_api tests anymore,
    # but keeping it for now in case other tests in this file need it.
    # If list_world_cards is part of PngMetadataHandler and used elsewhere, it should be AsyncMock if async.
    # For list_worlds_api, the world listing is done by WorldStateHandler.
    handler.list_world_cards = MagicMock(return_value=MOCK_WORLDS_DATA) # Assuming synchronous if not specified
    return handler

@pytest.fixture
def mock_world_state_handler():
    handler = MagicMock(spec=WorldStateHandler)
    # list_worlds is called by list_worlds_api. Mock its return value.
    # The endpoint itself is async, but the call to list_worlds() is not awaited.
    handler.list_worlds = MagicMock(return_value=MOCK_WORLDS_DATA)
    return handler

@pytest.fixture
def mock_logger():
    return MagicMock(spec=LogManager)

# Create a TestClient instance
client = TestClient(app)

def test_list_worlds_api_success(mock_world_state_handler, mock_logger):
    """Test successful listing of world cards using TestClient."""
    # Override dependencies for this test
    app.dependency_overrides[get_world_state_handler] = lambda: mock_world_state_handler
    app.dependency_overrides[get_logger] = lambda: mock_logger

    response = client.get("/api/world-cards") # Make request to the endpoint

    # Assertions for the response
    assert response.status_code == 200
    response_content = response.json() # TestClient handles JSON decoding
    assert response_content["success"] is True
    assert response_content["worlds"] == MOCK_WORLDS_DATA
    assert len(response_content["worlds"]) == 2
    assert response_content["worlds"][0]["name"] == "World Alpha"

    mock_world_state_handler.list_worlds.assert_called_once()
    mock_logger.log_step.assert_called_with(f"Found {len(MOCK_WORLDS_DATA)} worlds")

    # Clean up overrides
    app.dependency_overrides = {}


def test_list_worlds_api_handler_exception(mock_world_state_handler, mock_logger):
    """Test error handling when WorldStateHandler raises an exception using TestClient."""
    mock_world_state_handler.list_worlds.side_effect = Exception("World State Handler Error")

    app.dependency_overrides[get_world_state_handler] = lambda: mock_world_state_handler
    app.dependency_overrides[get_logger] = lambda: mock_logger

    response = client.get("/api/world-cards")

    assert response.status_code == 500
    response_content = response.json()
    assert response_content["success"] is False
    assert "Failed to list worlds: World State Handler Error" in response_content["message"]
    
    mock_world_state_handler.list_worlds.assert_called_once()
    mock_logger.log_error.assert_any_call("Error listing worlds: World State Handler Error")

    app.dependency_overrides = {}


def test_list_worlds_api_empty_list(mock_world_state_handler, mock_logger):
    """Test listing worlds when no worlds are available using TestClient."""
    mock_world_state_handler.list_worlds.return_value = []

    app.dependency_overrides[get_world_state_handler] = lambda: mock_world_state_handler
    app.dependency_overrides[get_logger] = lambda: mock_logger
        
    response = client.get("/api/world-cards")

    assert response.status_code == 200
    response_content = response.json()
    assert response_content["success"] is True
    assert response_content["worlds"] == []
    assert len(response_content["worlds"]) == 0

    mock_world_state_handler.list_worlds.assert_called_once()
    mock_logger.log_step.assert_called_with(f"Found 0 worlds")

    app.dependency_overrides = {}