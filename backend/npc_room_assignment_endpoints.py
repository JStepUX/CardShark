from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend import models
from backend.services import npc_room_assignment_service
from backend.database import get_db

router = APIRouter(
    tags=["NPC Room Assignments"], # Tag for API documentation
)

@router.post("/api/rooms/{room_id}/characters/{character_uuid}", response_model=models.NPCInRoomRead, status_code=status.HTTP_201_CREATED)
def assign_character_to_room(
    room_id: int,
    character_uuid: str,
    assignment_details: models.NPCInRoomCreate, # Request body for role
    db: Session = Depends(get_db)
):
    """
    Assigns a character to a specific room with an optional role.
    """
    try:
        return npc_room_assignment_service.add_character_to_room(
            db=db, 
            room_id=room_id, 
            character_uuid=character_uuid, 
            assignment_details=assignment_details
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/api/rooms/{room_id}/characters/{character_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_character_from_room(
    room_id: int,
    character_uuid: str,
    db: Session = Depends(get_db)
):
    """
    Removes a character from a specific room.
    """
    try:
        success = npc_room_assignment_service.remove_character_from_room(db=db, room_id=room_id, character_uuid=character_uuid)
        if not success: # Should be handled by exceptions in service, but as a safeguard
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found or could not be removed.")
        return  # FastAPI handles 204 No Content response automatically
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/api/rooms/{room_id}/characters", response_model=List[models.CharacterInRoomResponse])
def get_room_characters(
    room_id: int,
    db: Session = Depends(get_db)
):
    """
    Retrieves all characters assigned to a specific room, including their roles.
    """
    try:
        return npc_room_assignment_service.get_characters_in_room(db=db, room_id=room_id)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/api/characters/{character_uuid}/rooms", response_model=List[models.RoomRead])
def get_character_rooms(
    character_uuid: str,
    db: Session = Depends(get_db)
):
    """
    Retrieves all rooms a specific character is assigned to.
    """
    try:
        return npc_room_assignment_service.get_rooms_for_character(db=db, character_uuid=character_uuid)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))