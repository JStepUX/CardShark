from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
import logging

from backend import sql_models
from backend.schemas import RoomRead, RoomCreate, RoomUpdate
from backend.services import room_service
from backend.database import get_db
from backend.dependencies import get_logger_dependency
from backend.error_handlers import ValidationException, NotFoundException, handle_generic_error
from backend.response_models import DataResponse, ListResponse, create_data_response, STANDARD_RESPONSES

router = APIRouter(
    prefix="/api",
    tags=["rooms"],
    responses=STANDARD_RESPONSES
)

@router.post("/worlds/{world_uuid}/rooms/", response_model=DataResponse[RoomRead])
def create_room_for_world(
    world_uuid: str, 
    room: RoomCreate, 
    db: Session = Depends(get_db),
    logger: logging.Logger = Depends(get_logger_dependency)
):
    """Create a new room for a specific world."""
    try:
        # Ensure world_uuid in path matches world_uuid in body if present, or use path.
        if room.world_uuid and room.world_uuid != world_uuid:
            raise ValidationException("Path world_uuid does not match world_uuid in request body.")
        
        # If world_uuid is not in the body, set it from the path parameter.
        # The service layer will handle the check for world existence.
        room_data_with_world_uuid = room.model_copy(update={'world_uuid': world_uuid})
        
        result = room_service.create_room(db=db, room=room_data_with_world_uuid, world_uuid=world_uuid)
        return create_data_response(result, "Room created successfully")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.error(f"Error creating room for world {world_uuid}: {str(e)}")
        raise handle_generic_error(e, "Failed to create room")


@router.get("/rooms/{room_id}", response_model=DataResponse[RoomRead])
def read_room(
    room_id: int, 
    db: Session = Depends(get_db),
    logger: logging.Logger = Depends(get_logger_dependency)
):
    """Get a specific room by ID."""
    try:
        db_room = room_service.get_room(db, room_id=room_id)
        if db_room is None:
            raise NotFoundException(f"Room with ID {room_id} not found")
        return create_data_response(db_room, "Room retrieved successfully")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.error(f"Error retrieving room {room_id}: {str(e)}")
        raise handle_generic_error(e, "Failed to retrieve room")

@router.get("/rooms/", response_model=ListResponse[RoomRead])
def read_rooms(
    world_uuid: str | None = None, 
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    logger: logging.Logger = Depends(get_logger_dependency)
):
    """Get a list of rooms with optional filtering by world."""
    try:
        rooms = room_service.get_rooms(db, world_uuid=world_uuid, skip=skip, limit=limit)
        return ListResponse(
            success=True,
            message="Rooms retrieved successfully",
            data=rooms,
            count=len(rooms)
        )
    except Exception as e:
        logger.error(f"Error retrieving rooms: {str(e)}")
        raise handle_generic_error(e, "Failed to retrieve rooms")

@router.put("/rooms/{room_id}", response_model=DataResponse[RoomRead])
def update_existing_room(
    room_id: int, 
    room: RoomUpdate, 
    db: Session = Depends(get_db),
    logger: logging.Logger = Depends(get_logger_dependency)
):
    """Update an existing room."""
    try:
        db_room = room_service.update_room(db, room_id=room_id, room_update=room)
        if db_room is None:
            raise NotFoundException(f"Room with ID {room_id} not found")
        return create_data_response(db_room, "Room updated successfully")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.error(f"Error updating room {room_id}: {str(e)}")
        raise handle_generic_error(e, "Failed to update room")

@router.delete("/rooms/{room_id}", response_model=DataResponse[RoomRead])
def delete_existing_room(
    room_id: int, 
    db: Session = Depends(get_db),
    logger: logging.Logger = Depends(get_logger_dependency)
):
    """Delete an existing room."""
    try:
        db_room = room_service.delete_room(db, room_id=room_id)
        if db_room is None:
            raise NotFoundException(f"Room with ID {room_id} not found")
        return create_data_response(db_room, "Room deleted successfully")
    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.error(f"Error deleting room {room_id}: {str(e)}")
        raise handle_generic_error(e, "Failed to delete room")