from sqlalchemy.orm import Session
from backend import sql_models, schemas as pydantic_models # Use schemas for Pydantic models
import uuid
from typing import List, Optional
from datetime import datetime

def create_chat_session(db: Session, chat_session: pydantic_models.ChatSessionCreate) -> sql_models.ChatSession:
    # Generate UUID for session
    session_uuid = str(uuid.uuid4())
    
    db_chat_session = sql_models.ChatSession(
        chat_session_uuid=session_uuid,
        character_uuid=chat_session.character_uuid,
        user_uuid=chat_session.user_uuid,
        # chat_log_path removed as per database schema update
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

def get_chat_sessions_by_character(db: Session, character_uuid: str) -> List[sql_models.ChatSession]:
    """
    Get all chat sessions for a specific character, ordered by last_message_time descending.
    """
    return db.query(sql_models.ChatSession)\
        .filter(sql_models.ChatSession.character_uuid == character_uuid)\
        .order_by(sql_models.ChatSession.last_message_time.desc().nulls_last())\
        .all()

def get_latest_chat_session_for_character(db: Session, character_uuid: str) -> Optional[sql_models.ChatSession]:
    """
    Retrieves the most recent chat session for a given character that has actual conversation
    (at least one user message), ordered by last_message_time descending.
    Only returns chats that have been interacted with by the user.
    """
    # Use a join to find chat sessions that have user messages
    conversation_chat = db.query(sql_models.ChatSession)\
        .join(sql_models.ChatMessage, sql_models.ChatSession.chat_session_uuid == sql_models.ChatMessage.chat_session_uuid)\
        .filter(
            sql_models.ChatSession.character_uuid == character_uuid,
            sql_models.ChatMessage.role == 'user'
        )\
        .order_by(sql_models.ChatSession.last_message_time.desc().nulls_last(), sql_models.ChatSession.start_time.desc())\
        .first()

    return conversation_chat

def update_chat_session(db: Session, chat_session_uuid: str, chat_update: pydantic_models.ChatSessionUpdate) -> Optional[sql_models.ChatSession]:
    db_chat_session = get_chat_session(db, chat_session_uuid)
    if db_chat_session:
        if chat_update.title is not None:
            db_chat_session.title = chat_update.title
        # chat_log_path update removed as per database schema update
        if chat_update.message_count is not None:
            db_chat_session.message_count = chat_update.message_count
        
        # Always update last_message_time on any meaningful update
        # to reflect activity. If chat_log (messages) were part of this update,
        # this would be even more critical.
        db_chat_session.last_message_time = datetime.utcnow()
        db.commit()
        db.refresh(db_chat_session)
    return db_chat_session

# ChatMessage operations for Phase 1 database transition

def create_chat_message(db: Session, chat_session_uuid: str, role: str, content: str, 
                       status: str = "complete", reasoning_content: Optional[str] = None,
                       metadata_json: Optional[dict] = None) -> sql_models.ChatMessage:
    """Create a new chat message in the database."""
    message_id = str(uuid.uuid4())
    
    db_message = sql_models.ChatMessage(
        message_id=message_id,
        chat_session_uuid=chat_session_uuid,
        role=role,
        content=content,
        status=status,
        reasoning_content=reasoning_content,
        metadata_json=metadata_json
    )
    
    db.add(db_message)
    
    # Update chat session metadata
    chat_session = get_chat_session(db, chat_session_uuid)
    if chat_session:
        chat_session.message_count += 1
        chat_session.last_message_time = datetime.utcnow()
    
    db.commit()
    db.refresh(db_message)
    return db_message

def get_chat_messages(db: Session, chat_session_uuid: str, 
                     skip: int = 0, limit: int = 1000) -> List[sql_models.ChatMessage]:
    """Get messages for a chat session, ordered by timestamp."""
    return db.query(sql_models.ChatMessage)\
        .filter(sql_models.ChatMessage.chat_session_uuid == chat_session_uuid)\
        .order_by(sql_models.ChatMessage.timestamp.asc())\
        .offset(skip).limit(limit).all()

def get_chat_message(db: Session, message_id: str) -> Optional[sql_models.ChatMessage]:
    """Get a specific chat message by ID."""
    return db.query(sql_models.ChatMessage)\
        .filter(sql_models.ChatMessage.message_id == message_id).first()

def update_chat_message(db: Session, message_id: str, 
                       content: Optional[str] = None,
                       status: Optional[str] = None,
                       reasoning_content: Optional[str] = None,
                       metadata_json: Optional[dict] = None) -> Optional[sql_models.ChatMessage]:
    """Update a chat message."""
    db_message = get_chat_message(db, message_id)
    if db_message:
        if content is not None:
            db_message.content = content
        if status is not None:
            db_message.status = status
        if reasoning_content is not None:
            db_message.reasoning_content = reasoning_content
        if metadata_json is not None:
            db_message.metadata_json = metadata_json
        
        db_message.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_message)
    return db_message

def delete_chat_message(db: Session, message_id: str) -> Optional[sql_models.ChatMessage]:
    """Delete a chat message from the database."""
    try:
        db_message = get_chat_message(db, message_id)
        if not db_message:
            return None
        
        # Update chat session message count
        chat_session = get_chat_session(db, db_message.chat_session_uuid)
        if chat_session and chat_session.message_count > 0:
            chat_session.message_count -= 1
        
        db.delete(db_message)
        db.commit()
        return db_message
    except Exception as e:
        db.rollback()
        raise e

def get_chat_message_count(db: Session, chat_session_uuid: str) -> int:
    """Get the total number of messages in a chat session."""
    return db.query(sql_models.ChatMessage)\
        .filter(sql_models.ChatMessage.chat_session_uuid == chat_session_uuid).count()

def delete_chat_session(db: Session, chat_session_uuid: str) -> Optional[sql_models.ChatSession]:
    """Delete a chat session from the database"""
    try:
        db_chat_session = db.query(sql_models.ChatSession).filter(sql_models.ChatSession.chat_session_uuid == chat_session_uuid).first()
        if not db_chat_session:
            return None
        
        db.delete(db_chat_session)
        db.commit()
        return db_chat_session
    except Exception as e:
        db.rollback()
        raise e

def append_message_to_chat_session(db: Session, chat_session_uuid: str, message_payload: dict) -> Optional[sql_models.ChatSession]:
    """
    Appends a message to a chat session.
    This function primarily updates the session metadata in the database (message_count, last_message_time).
    """
    db_chat_session = get_chat_session(db, chat_session_uuid)
    if db_chat_session:
        # Increment message count
        db_chat_session.message_count += 1 # Assuming one message is appended at a time
        # Update last message time
        db_chat_session.last_message_time = datetime.utcnow()
        
        db.commit()
        db.refresh(db_chat_session)
    return db_chat_session