from sqlalchemy.orm import Session
from backend import sql_models, schemas as pydantic_models # Use schemas for Pydantic models
import uuid
from typing import List, Optional
from datetime import datetime

def create_chat_session(db: Session, chat_session: pydantic_models.ChatSessionCreate) -> sql_models.ChatSession:
    # In a real scenario, chat_log_path would be more robustly generated
    # e.g., based on world_uuid, character_uuid, session_uuid to ensure uniqueness and organization.
    # For now, we'll use a simple placeholder or assume it's provided if critical.
    # If chat_log_path is not part of ChatSessionCreate, it needs to be generated here.
    # For this example, let's assume it's part of the input or can be a simple default.

    db_chat_session = sql_models.ChatSession(
        chat_session_uuid=str(uuid.uuid4()),
        character_uuid=chat_session.character_uuid,
        user_uuid=chat_session.user_uuid,
        chat_log_path=chat_session.chat_log_path or f"logs/chat_{uuid.uuid4()}.jsonl", # Example path
        title=chat_session.title,
        start_time=datetime.utcnow(), # Set by server
        message_count=0 # Initial count
    )
    db.add(db_chat_session)
    db.commit()
    db.refresh(db_chat_session)
    return db_chat_session

def get_chat_session(db: Session, chat_session_uuid: str) -> Optional[sql_models.ChatSession]:
    return db.query(sql_models.ChatSession).filter(sql_models.ChatSession.chat_session_uuid == chat_session_uuid).first()

def get_chat_sessions(
    db: Session, 
    skip: int = 0, 
    limit: int = 100, 
    character_uuid: Optional[str] = None,
    user_uuid: Optional[str] = None
) -> List[sql_models.ChatSession]:
    query = db.query(sql_models.ChatSession)
    if character_uuid:
        query = query.filter(sql_models.ChatSession.character_uuid == character_uuid)
    if user_uuid:
        query = query.filter(sql_models.ChatSession.user_uuid == user_uuid)
    return query.offset(skip).limit(limit).all()

def update_chat_session(db: Session, chat_session_uuid: str, chat_update: pydantic_models.ChatSessionUpdate) -> Optional[sql_models.ChatSession]:
    db_chat_session = get_chat_session(db, chat_session_uuid)
    if db_chat_session:
        if chat_update.title is not None:
            db_chat_session.title = chat_update.title
        # last_message_time and message_count are typically updated when messages are added,
        # not directly via a generic update endpoint for the session metadata itself.
        # If other fields become updatable, add them here.
        db_chat_session.last_message_time = datetime.utcnow() # Or keep existing if no messages added
        db.commit()
        db.refresh(db_chat_session)
    return db_chat_session

def delete_chat_session(db: Session, chat_session_uuid: str) -> Optional[sql_models.ChatSession]:
    db_chat_session = get_chat_session(db, chat_session_uuid)
    if db_chat_session:
        # Here, you might also want to handle the deletion or archiving of the chat_log_path file.
        # For now, we just delete the metadata record.
        db.delete(db_chat_session)
        db.commit()
    return db_chat_session