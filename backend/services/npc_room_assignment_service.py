from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from typing import List, Optional

from backend import sql_models
from backend import schemas as pydantic_models # Use schemas for Pydantic models

def add_character_to_room(db: Session, room_id: int, character_uuid: str, assignment_details: pydantic_models.NPCInRoomCreate) -> sql_models.NPCInRoom:
    """
    Assigns a character to a room.
    """
    # Check if room exists
    db_room = db.query(sql_models.Room).filter(sql_models.Room.room_id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Room with id {room_id} not found")

    # Check if character exists
    db_character = db.query(sql_models.Character).filter(sql_models.Character.character_uuid == character_uuid).first()
    if not db_character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Character with uuid {character_uuid} not found")

    # Check if assignment already exists
    existing_assignment = db.query(sql_models.NPCInRoom).filter(
        sql_models.NPCInRoom.room_id == room_id,
        sql_models.NPCInRoom.npc_character_uuid == character_uuid
    ).first()

    if existing_assignment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Character {character_uuid} is already in room {room_id}"
        )

    db_assignment = sql_models.NPCInRoom(
        room_id=room_id,
        npc_character_uuid=character_uuid,
        npc_role_in_room=assignment_details.npc_role_in_room
    )
    db.add(db_assignment)
    try:
        db.commit()
        db.refresh(db_assignment)
    except IntegrityError: # Catch potential race conditions or other integrity issues
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not assign character to room due to a database error."
        )
    return db_assignment

def remove_character_from_room(db: Session, room_id: int, character_uuid: str) -> bool:
    """
    Removes a character from a room. Returns True if successful, False otherwise.
    """
    db_assignment = db.query(sql_models.NPCInRoom).filter(
        sql_models.NPCInRoom.room_id == room_id,
        sql_models.NPCInRoom.npc_character_uuid == character_uuid
    ).first()

    if not db_assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_uuid} not found in room {room_id}"
        )
    
    db.delete(db_assignment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not remove character from room due to a database error."
        )
    return True

def get_characters_in_room(db: Session, room_id: int) -> List[pydantic_models.CharacterInRoomResponse]:
    """
    Gets all characters assigned to a specific room, including their role.
    """
    # Check if room exists
    db_room = db.query(sql_models.Room).filter(sql_models.Room.room_id == room_id).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Room with id {room_id} not found")

    assignments = db.query(sql_models.NPCInRoom).filter(sql_models.NPCInRoom.room_id == room_id).all()
    
    characters_in_room: List[pydantic_models.CharacterInRoomResponse] = []
    for assignment in assignments:
        character = assignment.npc_character # Access the related Character object
        if character:
            characters_in_room.append(
                pydantic_models.CharacterInRoomResponse(
                    character_uuid=character.character_uuid,
                    name=character.name,
                    description=character.description,
                    png_file_path=character.png_file_path,
                    created_at=character.created_at,
                    updated_at=character.updated_at,
                    npc_role_in_room=assignment.npc_role_in_room
                    # Ensure all fields from CharacterRead are populated
                )
            )
    return characters_in_room

def get_rooms_for_character(db: Session, character_uuid: str) -> List[pydantic_models.RoomRead]:
    """
    Gets all rooms a specific character is assigned to.
    """
    # Check if character exists
    db_character = db.query(sql_models.Character).filter(sql_models.Character.character_uuid == character_uuid).first()
    if not db_character:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Character with uuid {character_uuid} not found")

    assignments = db.query(sql_models.NPCInRoom).filter(sql_models.NPCInRoom.npc_character_uuid == character_uuid).all()
    
    rooms_for_character: List[pydantic_models.RoomRead] = []
    for assignment in assignments:
        room = assignment.room # Access the related Room object
        if room:
            # Manually construct RoomRead to ensure all fields are present
            rooms_for_character.append(
                pydantic_models.RoomRead(
                    room_id=room.room_id,
                    world_uuid=room.world_uuid,
                    name=room.name,
                    description=room.description,
                    introduction_text=room.introduction_text,
                    grid_coordinates=room.grid_coordinates
                )
            )
    return rooms_for_character