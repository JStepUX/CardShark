from sqlalchemy.orm import Session
from backend import sql_models # Adjusted import
from backend import schemas # Adjusted import
import uuid

def create_world(db: Session, world: schemas.WorldCreate) -> sql_models.World:
    db_world = sql_models.World(
        world_uuid=str(uuid.uuid4()),
        name=world.name,
        description=world.description,
        source_character_uuid=world.source_character_uuid
    )
    db.add(db_world)
    db.commit()
    db.refresh(db_world)
    return db_world

def get_world(db: Session, world_uuid: str) -> sql_models.World | None:
    return db.query(sql_models.World).filter(sql_models.World.world_uuid == world_uuid).first()

def get_worlds(db: Session, skip: int = 0, limit: int = 100) -> list[sql_models.World]:
    return db.query(sql_models.World).offset(skip).limit(limit).all()

def update_world(db: Session, world_uuid: str, world_update: schemas.WorldUpdate) -> sql_models.World | None:
    db_world = get_world(db, world_uuid)
    if db_world:
        update_data = world_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_world, key, value)
        db.commit()
        db.refresh(db_world)
    return db_world

def delete_world(db: Session, world_uuid: str) -> sql_models.World | None:
    db_world = get_world(db, world_uuid)
    if db_world:
        db.delete(db_world)
        db.commit()
    return db_world