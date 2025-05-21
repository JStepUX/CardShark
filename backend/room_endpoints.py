from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend import models, sql_models
from backend.services import room_service
from backend.database import get_db

router = APIRouter()

@router.post("/api/worlds/{world_uuid}/rooms/", response_model=models.RoomRead, tags=["Rooms"])
def create_room_for_world(
    world_uuid: str, room: models.RoomCreate, db: Session = Depends(get_db)
):
    # Ensure world_uuid in path matches world_uuid in body if present, or use path.
    if room.world_uuid and room.world_uuid != world_uuid:
        raise HTTPException(status_code=400, detail="Path world_uuid does not match world_uuid in request body.")
    # If world_uuid is not in the body, set it from the path parameter.
    # The service layer will handle the check for world existence.
    room_data_with_world_uuid = room.model_copy(update={'world_uuid': world_uuid})

    try:
        return room_service.create_room(db=db, room=room_data_with_world_uuid, world_uuid=world_uuid)
    except HTTPException as e:
        raise e # Re-raise HTTPException from service layer (e.g. world not found)
    except Exception as e:
        # Catch any other unexpected errors during room creation
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.get("/api/rooms/{room_id}", response_model=models.RoomRead, tags=["Rooms"])
def read_room(room_id: int, db: Session = Depends(get_db)):
    db_room = room_service.get_room(db, room_id=room_id)
    if db_room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return db_room

@router.get("/api/rooms/", response_model=List[models.RoomRead], tags=["Rooms"])
def read_rooms(
    world_uuid: str | None = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
    rooms = room_service.get_rooms(db, world_uuid=world_uuid, skip=skip, limit=limit)
    return rooms

@router.put("/api/rooms/{room_id}", response_model=models.RoomRead, tags=["Rooms"])
def update_existing_room(
    room_id: int, room: models.RoomUpdate, db: Session = Depends(get_db)
):
    db_room = room_service.update_room(db, room_id=room_id, room_update=room)
    if db_room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return db_room

@router.delete("/api/rooms/{room_id}", response_model=models.RoomRead, tags=["Rooms"])
def delete_existing_room(room_id: int, db: Session = Depends(get_db)):
    db_room = room_service.delete_room(db, room_id=room_id)
    if db_room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return db_room