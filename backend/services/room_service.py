from sqlalchemy.orm import Session
from backend import sql_models, models
from fastapi import HTTPException

def create_room(db: Session, room: models.RoomCreate, world_uuid: str) -> sql_models.Room:
    # Check if the world exists
    db_world = db.query(sql_models.World).filter(sql_models.World.world_uuid == world_uuid).first()
    if not db_world:
        raise HTTPException(status_code=404, detail=f"World with uuid {world_uuid} not found")

    db_room = sql_models.Room(**room.model_dump(), world_uuid=world_uuid)
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room

def get_room(db: Session, room_id: int) -> sql_models.Room | None:
    return db.query(sql_models.Room).filter(sql_models.Room.room_id == room_id).first()

def get_rooms(db: Session, world_uuid: str | None = None, skip: int = 0, limit: int = 100) -> list[sql_models.Room]:
    query = db.query(sql_models.Room)
    if world_uuid:
        query = query.filter(sql_models.Room.world_uuid == world_uuid)
    return query.offset(skip).limit(limit).all()

def update_room(db: Session, room_id: int, room_update: models.RoomUpdate) -> sql_models.Room | None:
    db_room = db.query(sql_models.Room).filter(sql_models.Room.room_id == room_id).first()
    if db_room:
        update_data = room_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_room, key, value)
        db.commit()
        db.refresh(db_room)
    return db_room

def delete_room(db: Session, room_id: int) -> sql_models.Room | None:
    db_room = db.query(sql_models.Room).filter(sql_models.Room.room_id == room_id).first()
    if db_room:
        db.delete(db_room)
        db.commit()
    return db_room