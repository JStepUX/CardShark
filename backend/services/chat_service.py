"""
@file chat_service.py
@description Service handling chat logic, message generation, and interaction with LLM backends.
@dependencies chat_db_manager, character_service, koboldcpp_handler
@consumers chat_endpoints.py
"""
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

    This implements the auto-load chat history feature:
    - Only returns chats that have been interacted with by the user (>1 message)
    - Filters out empty chats (only greeting, no user messages)
    - Orders by last_message_time to get the most recent active conversation
    - Returns None if no chats with user messages exist (frontend falls back to first_mes)

    This ensures users pick up where they left off when selecting a character.
    """
    # Use a join to find chat sessions that have user messages
    # This filters for message_count > 1 (greeting + at least one user message)
    conversation_chat = db.query(sql_models.ChatSession)\
        .join(sql_models.ChatMessage, sql_models.ChatSession.chat_session_uuid == sql_models.ChatMessage.chat_session_uuid)\
        .filter(
            sql_models.ChatSession.character_uuid == character_uuid,
            sql_models.ChatMessage.role == 'user'  # Only chats with user interaction
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
                       metadata_json: Optional[dict] = None, message_id: Optional[str] = None,
                       sequence_number: Optional[int] = None) -> sql_models.ChatMessage:
    """Create a new chat message in the database."""
    if not message_id:
        message_id = str(uuid.uuid4())
    
    # If sequence_number is not provided, find the next one
    if sequence_number is None:
        last_msg = db.query(sql_models.ChatMessage)\
            .filter(sql_models.ChatMessage.chat_session_uuid == chat_session_uuid)\
            .order_by(sql_models.ChatMessage.sequence_number.desc())\
            .first()
        sequence_number = (last_msg.sequence_number + 1) if last_msg else 0

    db_message = sql_models.ChatMessage(
        message_id=message_id,
        chat_session_uuid=chat_session_uuid,
        role=role,
        content=content,
        status=status,
        reasoning_content=reasoning_content,
        metadata_json=metadata_json,
        sequence_number=sequence_number
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

def replace_chat_session_messages(db: Session, chat_session_uuid: str, messages_data: List[dict]) -> List[sql_models.ChatMessage]:
    """
    Atomically replaces all messages in a chat session with the provided list.
    Preserves message IDs if provided in the payload, unless they collide with existing IDs from other sessions.
    """
    try:
        # 1. Delete existing messages
        db.query(sql_models.ChatMessage).filter(
            sql_models.ChatMessage.chat_session_uuid == chat_session_uuid
        ).delete(synchronize_session=False)

        # 2. Identify potential ID collisions with other sessions
        # Since we just deleted all messages for THIS session, any ID that still exists
        # belongs to another session and must not be reused.
        input_ids = [
            m.get('id') or m.get('message_id') 
            for m in messages_data 
            if (m.get('id') or m.get('message_id'))
        ]
        
        existing_ids = set()
        if input_ids:
            # Chunk queries to avoid SQLite variable limit
            chunk_size = 500
            for i in range(0, len(input_ids), chunk_size):
                chunk = input_ids[i:i + chunk_size]
                found = db.query(sql_models.ChatMessage.message_id).filter(
                    sql_models.ChatMessage.message_id.in_(chunk)
                ).all()
                existing_ids.update(r[0] for r in found)

        new_messages = []
        seen_ids = set()

        for idx, message_data in enumerate(messages_data):
            # Extract fields
            # Frontend often sends 'id' or 'message_id'
            msg_id = message_data.get('id') or message_data.get('message_id')
            if not msg_id:
                msg_id = str(uuid.uuid4())
            
            # Prevent duplicate IDs within the same payload or collisions with DB
            if msg_id in seen_ids or msg_id in existing_ids:
                # If we encounter a duplicate/colliding ID, generate a new one
                msg_id = str(uuid.uuid4())
            
            seen_ids.add(msg_id)
                
            role = message_data.get('role', 'user')
            content = message_data.get('content', '') or message_data.get('text', '')
            status = message_data.get('status', 'complete')
            reasoning_content = message_data.get('reasoning_content')
            metadata_json = message_data.get('metadata')
            
            db_message = sql_models.ChatMessage(
                message_id=msg_id,
                chat_session_uuid=chat_session_uuid,
                role=role,
                content=content,
                status=status,
                reasoning_content=reasoning_content,
                metadata_json=metadata_json,
                timestamp=datetime.utcnow(),
                sequence_number=idx # Assign sequence number to preserve order
            )
            
            # If timestamp is provided in ms (frontend standard), convert it
            if 'timestamp' in message_data and message_data['timestamp']:
                try:
                    ts = message_data['timestamp']
                    if isinstance(ts, (int, float)):
                        db_message.timestamp = datetime.fromtimestamp(ts / 1000.0)
                    elif isinstance(ts, str):
                        # Try to parse string ISO?
                        # Using fromisoformat if it looks like one, but keep it simple
                        try:
                            # Strip Z and handle space/T
                            clean_ts = ts.replace('Z', '').replace(' ', 'T')
                            db_message.timestamp = datetime.fromisoformat(clean_ts)
                        except:
                            pass 
                except:
                    pass

            db.add(db_message)
            new_messages.append(db_message)
        
        # Update session metadata
        chat_session = get_chat_session(db, chat_session_uuid)
        if chat_session:
            chat_session.message_count = len(new_messages)
            if new_messages:
                # Use the timestamp of the last message as the session's last_message_time
                chat_session.last_message_time = new_messages[-1].timestamp
            else:
                chat_session.last_message_time = datetime.utcnow()
        
        db.commit()
        return new_messages
    except Exception as e:
        db.rollback()
        raise e

def get_chat_messages(db: Session, chat_session_uuid: str, 
                     skip: int = 0, limit: int = 1000) -> List[sql_models.ChatMessage]:
    """Get messages for a chat session, ordered by sequence_number then timestamp."""
    return db.query(sql_models.ChatMessage)\
        .filter(sql_models.ChatMessage.chat_session_uuid == chat_session_uuid)\
        .order_by(sql_models.ChatMessage.sequence_number.asc(), sql_models.ChatMessage.timestamp.asc())\
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


# Session Settings operations for Context Lens feature

def get_session_settings(db: Session, chat_session_uuid: str) -> Optional[dict]:
    """
    Get session settings (notes and compression flag) for a chat session.
    Returns a dict with session_notes and compression_enabled, or None if session not found.
    """
    chat_session = get_chat_session(db, chat_session_uuid)
    if not chat_session:
        return None
    
    return {
        "session_notes": chat_session.session_notes,
        "compression_enabled": bool(chat_session.compression_enabled),  # Convert INTEGER to bool
        "title": chat_session.title
    }


def update_session_settings(db: Session, chat_session_uuid: str, 
                           session_notes: Optional[str] = None,
                           compression_enabled: Optional[bool] = None,
                           title: Optional[str] = None) -> bool:
    """
    Update session settings for a chat session.
    Returns True if successful, False if session not found.
    """
    chat_session = get_chat_session(db, chat_session_uuid)
    if not chat_session:
        return False
    
    # Update fields if provided
    if session_notes is not None:
        chat_session.session_notes = session_notes
    
    if compression_enabled is not None:
        chat_session.compression_enabled = 1 if compression_enabled else 0  # Convert bool to INTEGER
    
    if title is not None:
        chat_session.title = title
    
    db.commit()
    db.refresh(chat_session)
    return True
