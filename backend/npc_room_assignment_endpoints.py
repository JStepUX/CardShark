from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from backend import schemas as pydantic_models # Use schemas for Pydantic models
from backend.services import npc_room_assignment_service
from backend.database import get_db

# Import standardized response models and error handling
from backend.response_models import (
    DataResponse,
    ListResponse,
    ErrorResponse,
    STANDARD_RESPONSES,
    create_data_response,
    create_list_response,
    create_error_response
)
from backend.error_handlers import (
    handle_database_error,
    handle_validation_error,
    handle_generic_error,
    NotFoundException,
    ValidationException
)
from backend.dependencies import get_logger_dependency
from backend.log_manager import LogManager

router = APIRouter(
    tags=["NPC Room Assignments"], # Tag for API documentation
    responses=STANDARD_RESPONSES
)

@router.post("/api/rooms/{room_id}/characters/{character_uuid}", response_model=pydantic_models.NPCInRoomRead, status_code=status.HTTP_201_CREATED)
def assign_character_to_room(
    room_id: int,
    character_uuid: str,
    assignment_details: pydantic_models.NPCInRoomCreate, # Request body for role
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Assigns a character to a specific room with an optional role.
    """
    try:
        logger.log_step(f"Assigning character {character_uuid} to room {room_id}")
        return npc_room_assignment_service.add_character_to_room(
            db=db, 
            room_id=room_id, 
            character_uuid=character_uuid, 
            assignment_details=assignment_details
        )
    except Exception as e:
        logger.log_error(f"Error assigning character {character_uuid} to room {room_id}: {str(e)}")
        return handle_generic_error(e, logger, "assigning character to room")


@router.delete("/api/rooms/{room_id}/characters/{character_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_character_from_room(
    room_id: int,
    character_uuid: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Removes a character from a specific room.
    """
    try:
        logger.log_step(f"Removing character {character_uuid} from room {room_id}")
        success = npc_room_assignment_service.remove_character_from_room(db=db, room_id=room_id, character_uuid=character_uuid)
        if not success: # Should be handled by exceptions in service, but as a safeguard
            raise NotFoundException("Assignment not found or could not be removed.")
        return  # FastAPI handles 204 No Content response automatically
    except NotFoundException:
        raise
    except Exception as e:
        logger.log_error(f"Error removing character {character_uuid} from room {room_id}: {str(e)}")
        return handle_generic_error(e, logger, "removing character from room")


@router.get("/api/rooms/{room_id}/characters", response_model=List[pydantic_models.CharacterInRoomResponse])
def get_room_characters(
    room_id: int,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Retrieves all characters assigned to a specific room, including their roles.
    """
    try:
        logger.log_step(f"Getting characters in room {room_id}")
        return npc_room_assignment_service.get_characters_in_room(db=db, room_id=room_id)
    except Exception as e:
        logger.log_error(f"Error getting characters in room {room_id}: {str(e)}")
        return handle_generic_error(e, logger, "getting characters in room")


@router.get("/api/characters/{character_uuid}/rooms", response_model=List[pydantic_models.RoomRead])
def get_character_rooms(
    character_uuid: str,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger_dependency)
):
    """
    Retrieves all rooms a specific character is assigned to.
    """
    try:
        logger.log_step(f"Getting rooms for character {character_uuid}")
        return npc_room_assignment_service.get_rooms_for_character(db=db, character_uuid=character_uuid)
    except Exception as e:
        logger.log_error(f"Error getting rooms for character {character_uuid}: {str(e)}")
        return handle_generic_error(e, logger, "getting rooms for character")