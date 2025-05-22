import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.room_endpoints import create_room_for_world, get_db
from backend.services import room_service
from backend import schemas as pydantic_models
from backend import sql_models

# Test data
WORLD_UUID_FROM_PATH = "test-world-uuid-path"
VALID_ROOM_CREATE_DATA = {
    "name": "The Grand Hall",
    "description": "A magnificent hall.",
    "world_uuid": WORLD_UUID_FROM_PATH, # Matches path
    "room_image_url": "http://example.com/image.png"
}
CREATED_ROOM_DATA = {
    "room_id": 1, # Changed 'id' to 'room_id' to match sql_models.Room
    "name": "The Grand Hall",
    "description": "A magnificent hall.",
    "world_uuid": WORLD_UUID_FROM_PATH
}

@pytest.fixture
def mock_db_session():
    return MagicMock(spec=Session)

def test_create_room_for_world_success(mock_db_session):
    """Test successful creation of a room for a world."""
    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)
    
    # Mock the room_service.create_room function
    # It should return an object that can be serialized by Pydantic (like a SQLModel instance)
    mock_created_room_sql = sql_models.Room(**CREATED_ROOM_DATA)

    with patch("backend.room_endpoints.room_service.create_room", return_value=mock_created_room_sql) as mock_create_room_svc:
        # Override the get_db dependency
        def override_get_db():
            return mock_db_session
        
        from backend import room_endpoints
        room_endpoints.get_db = override_get_db # Apply the override

        response_room = create_room_for_world(
            world_uuid=WORLD_UUID_FROM_PATH,
            room=room_create_pydantic,
            db=mock_db_session # Explicitly pass, though Depends should also work with override
        )

    mock_create_room_svc.assert_called_once_with(db=mock_db_session, room=room_create_pydantic, world_uuid=WORLD_UUID_FROM_PATH)
    assert response_room.name == VALID_ROOM_CREATE_DATA["name"]
    assert response_room.world_uuid == WORLD_UUID_FROM_PATH
    assert response_room.room_id == CREATED_ROOM_DATA["room_id"] # Use room_id from updated CREATED_ROOM_DATA


def test_create_room_for_world_uuid_mismatch(mock_db_session):
    """Test room creation when world_uuid in body mismatches world_uuid in path."""
    mismatched_room_data = VALID_ROOM_CREATE_DATA.copy()
    mismatched_room_data["world_uuid"] = "mismatched-uuid"
    room_create_pydantic = pydantic_models.RoomCreate(**mismatched_room_data)

    with patch("backend.room_endpoints.room_service.create_room") as mock_create_room_svc:
        def override_get_db():
            return mock_db_session
        
        from backend import room_endpoints
        room_endpoints.get_db = override_get_db

        with pytest.raises(HTTPException) as exc_info:
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session
            )
    
    assert exc_info.value.status_code == 400
    assert "Path world_uuid does not match world_uuid in request body." in exc_info.value.detail
    mock_create_room_svc.assert_not_called()


def test_create_room_for_world_service_raises_http_exception(mock_db_session):
    """Test when room_service.create_room itself raises an HTTPException (e.g., world not found)."""
    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)

    # Simulate room_service.create_room raising an HTTPException (e.g., world not found by service)
    with patch("backend.room_endpoints.room_service.create_room", side_effect=HTTPException(status_code=404, detail="World not found by service")) as mock_create_room_svc:
        def override_get_db():
            return mock_db_session
        
        from backend import room_endpoints
        room_endpoints.get_db = override_get_db

        with pytest.raises(HTTPException) as exc_info:
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session
            )
            
    mock_create_room_svc.assert_called_once_with(db=mock_db_session, room=room_create_pydantic, world_uuid=WORLD_UUID_FROM_PATH)
    assert exc_info.value.status_code == 404
    assert "World not found by service" in exc_info.value.detail

def test_create_room_for_world_service_raises_unexpected_exception(mock_db_session):
    """Test when room_service.create_room raises an unexpected non-HTTP error."""
    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)

    with patch("backend.room_endpoints.room_service.create_room", side_effect=ValueError("Unexpected service error")) as mock_create_room_svc:
        def override_get_db():
            return mock_db_session
        
        from backend import room_endpoints
        room_endpoints.get_db = override_get_db

        with pytest.raises(HTTPException) as exc_info: # Expect HTTPException
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session
            )
        
    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "An unexpected error occurred: Unexpected service error"
    mock_create_room_svc.assert_called_once_with(db=mock_db_session, room=room_create_pydantic, world_uuid=WORLD_UUID_FROM_PATH)