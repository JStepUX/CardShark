import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from typing import Dict, Any, List
from datetime import datetime
import uuid as uuid_module

# Import based on actual project structure
from backend.world_card_handler import WorldCardHandler
from backend.models.world_state import WorldState, Room, PlayerState, WorldMetadata, Position, GridSize
from backend.log_manager import LogManager
from backend.main import app
from backend.dependencies import get_world_card_handler_dependency, get_logger_dependency

# Mock data
MOCK_WORLDS_DATA = [
    {
        "name": "World Alpha", 
        "character_uuid": "uuid-1", 
        "location_count": 5, 
        "unconnected_location_count": 0,
        "base_character_name": "Char A",
        "path": "/path/to/alpha.png",
        "last_modified_date": 1234567890
    },
    {
        "name": "World Beta", 
        "character_uuid": "uuid-2", 
        "location_count": 3, 
        "unconnected_location_count": 2,
        "base_character_name": "Char B",
        "path": "/path/to/beta.png",
        "last_modified_date": 1234567899
    },
]

MOCK_WORLD_STATE = WorldState(
    schema_version=2,
    metadata=WorldMetadata(
        name="Test World",
        description="A test world",
        author="Test Author",
        uuid=str(uuid_module.uuid4()),
        created_at=datetime.now(),
        last_modified=datetime.now(),
        cover_image=None
    ),
    grid_size=GridSize(width=8, height=6),
    rooms=[
        Room(
            id="room-origin",
            name="Origin",
            description="Start location",
            introduction_text="You find yourself at the origin",
            image_path=None,
            position=Position(x=0, y=0),
            npcs=[],
            visited=True
        )
    ],
    player=PlayerState(
        current_room="room-origin",
        visited_rooms=["room-origin"]
    )
)

@pytest.fixture
def mock_world_card_handler():
    handler = MagicMock(spec=WorldCardHandler)
    handler.list_worlds = MagicMock(return_value=MOCK_WORLDS_DATA)
    handler.create_world = MagicMock(return_value={"name": "New World", "character_uuid": "new-uuid", "path": "path.png"})
    handler.get_world_state = MagicMock(return_value=MOCK_WORLD_STATE)
    handler.save_world_state = MagicMock(return_value=True)
    handler.delete_world = MagicMock(return_value=True)
    return handler

@pytest.fixture
def mock_logger():
    return MagicMock(spec=LogManager)

@pytest.fixture
def client(mock_world_card_handler, mock_logger):
    # Override dependencies
    app.dependency_overrides[get_world_card_handler_dependency] = lambda: mock_world_card_handler
    app.dependency_overrides[get_logger_dependency] = lambda: mock_logger
    
    with TestClient(app) as c:
        yield c
    
    # Clean up
    app.dependency_overrides = {}

def test_list_worlds_api_success(client, mock_world_card_handler):
    """Test successful listing of world cards."""
    response = client.get("/api/world-cards")
    
    assert response.status_code == 200
    content = response.json()
    assert content["success"] is True
    assert content["data"] == MOCK_WORLDS_DATA
    assert len(content["data"]) == 2
    mock_world_card_handler.list_worlds.assert_called_once()

def test_list_worlds_api_error(client, mock_world_card_handler):
    """Test error handling in list worlds."""
    mock_world_card_handler.list_worlds.side_effect = Exception("DB Error")
    
    response = client.get("/api/world-cards")
    
    assert response.status_code == 500
    content = response.json()
    assert content["success"] is False
    assert "listing worlds" in content["error"]

def test_create_world_api_success(client, mock_world_card_handler):
    """Test creating a new world."""
    payload = {"name": "New World", "character_path": "some_char.png"}
    response = client.post("/api/world-cards/create", json=payload)
    
    assert response.status_code == 201
    content = response.json()
    assert content["success"] is True
    assert content["data"]["name"] == "New World"
    
    mock_world_card_handler.create_world.assert_called_with("New_World", "some_char.png") # Expect sanitized name

def test_create_world_api_missing_name(client):
    """Test validation error for missing name."""
    response = client.post("/api/world-cards/create", json={})
    
    assert response.status_code == 422 # Validation error
    content = response.json()
    assert content["success"] is False

def test_get_world_state_success(client, mock_world_card_handler):
    """Test getting world state."""
    response = client.get("/api/world-cards/Test World/state")
    
    assert response.status_code == 200
    content = response.json()
    assert content["success"] is True
    assert content["data"]["metadata"]["name"] == "Test World"
    mock_world_card_handler.get_world_state.assert_called_with("Test World")

def test_get_world_state_not_found(client, mock_world_card_handler):
    """Test getting non-existent world state."""
    mock_world_card_handler.get_world_state.return_value = None
    
    response = client.get("/api/world-cards/Missing World/state")
    
    assert response.status_code == 404
    content = response.json()
    assert content["success"] is False
    assert "not found" in content["error"]

def test_save_world_state_success(client, mock_world_card_handler):
    """Test saving world state."""
    payload = {"state": MOCK_WORLD_STATE.dict()}
    response = client.post("/api/world-cards/Test World/state", json=payload)
    
    assert response.status_code == 200
    content = response.json()
    assert content["success"] is True
    assert "saved" in content["data"]["message"]
    mock_world_card_handler.save_world_state.assert_called_once()

def test_delete_world_success(client, mock_world_card_handler):
    """Test deleting a world."""
    response = client.delete("/api/world-cards/Test World")
    
    assert response.status_code == 200
    content = response.json()
    assert content["success"] is True
    mock_world_card_handler.delete_world.assert_called_with("Test World")

def test_delete_world_not_found(client, mock_world_card_handler):
    """Test deleting non-existent world."""
    mock_world_card_handler.delete_world.return_value = False
    
    response = client.delete("/api/world-cards/Missing World")
    
    assert response.status_code == 404
    content = response.json()
    assert content["success"] is False
