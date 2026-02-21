import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from sqlalchemy.orm import Session
import logging

from backend.endpoints.room_endpoints import create_room_for_world
from backend.database import get_db
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

@pytest.fixture
def mock_logger():
    return MagicMock(spec=logging.Logger)

def test_create_room_for_world_success(mock_db_session, mock_logger):
    """Test successful creation of a room for a world."""
    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)

    # Mock the room_service.create_room function
    # It should return an object that can be serialized by Pydantic (like a SQLModel instance)
    mock_created_room_sql = sql_models.Room(**CREATED_ROOM_DATA)

    with patch("backend.endpoints.room_endpoints.room_service.create_room", return_value=mock_created_room_sql) as mock_create_room_svc:
        response_room = create_room_for_world(
            world_uuid=WORLD_UUID_FROM_PATH,
            room=room_create_pydantic,
            db=mock_db_session,
            logger=mock_logger
        )

    # Note: The endpoint modifies the room with model_copy before passing to service
    mock_create_room_svc.assert_called_once()
    call_args = mock_create_room_svc.call_args
    assert call_args.kwargs['db'] == mock_db_session
    assert call_args.kwargs['world_uuid'] == WORLD_UUID_FROM_PATH
    assert response_room.data.name == VALID_ROOM_CREATE_DATA["name"]
    assert response_room.data.world_uuid == WORLD_UUID_FROM_PATH
    assert response_room.data.room_id == CREATED_ROOM_DATA["room_id"]


def test_create_room_for_world_uuid_mismatch(mock_db_session, mock_logger):
    """Test room creation when world_uuid in body mismatches world_uuid in path."""
    from backend.error_handlers import ValidationException

    mismatched_room_data = VALID_ROOM_CREATE_DATA.copy()
    mismatched_room_data["world_uuid"] = "mismatched-uuid"
    room_create_pydantic = pydantic_models.RoomCreate(**mismatched_room_data)

    with patch("backend.endpoints.room_endpoints.room_service.create_room") as mock_create_room_svc:
        with pytest.raises(ValidationException) as exc_info:
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session,
                logger=mock_logger
            )

    assert "Path world_uuid does not match world_uuid in request body" in str(exc_info.value.message)
    mock_create_room_svc.assert_not_called()


def test_create_room_for_world_service_raises_http_exception(mock_db_session, mock_logger):
    """Test when room_service.create_room itself raises an HTTPException (e.g., world not found)."""
    from backend.error_handlers import NotFoundException

    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)

    # Simulate room_service.create_room raising a NotFoundException
    with patch("backend.endpoints.room_endpoints.room_service.create_room", side_effect=NotFoundException("World not found by service")) as mock_create_room_svc:
        with pytest.raises(NotFoundException) as exc_info:
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session,
                logger=mock_logger
            )

    mock_create_room_svc.assert_called_once()
    assert "World not found by service" in str(exc_info.value.message)

def test_create_room_for_world_service_raises_unexpected_exception(mock_db_session, mock_logger):
    """Test when room_service.create_room raises an unexpected non-HTTP error."""
    room_create_pydantic = pydantic_models.RoomCreate(**VALID_ROOM_CREATE_DATA)

    with patch("backend.endpoints.room_endpoints.room_service.create_room", side_effect=ValueError("Unexpected service error")) as mock_create_room_svc:
        with pytest.raises(HTTPException) as exc_info:
            create_room_for_world(
                world_uuid=WORLD_UUID_FROM_PATH,
                room=room_create_pydantic,
                db=mock_db_session,
                logger=mock_logger
            )

    assert exc_info.value.status_code == 500
    mock_create_room_svc.assert_called_once()