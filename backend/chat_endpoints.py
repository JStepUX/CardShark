from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pathlib import Path
import datetime
import os
import uuid
import time
import json

from backend import schemas as pydantic_models, sql_models # Use schemas for Pydantic models
from backend.services import chat_service
from backend.services.character_service import CharacterService # Import CharacterService
from backend.services.reliable_chat_manager_v2 import ReliableChatManager
from backend.services.reliable_chat_manager_db import DatabaseReliableChatManager
from backend.services.chat_models import ChatOperationResult, ChatMessage
from backend.services.chat_endpoint_adapters import ChatEndpointAdapters
from backend.services.database_chat_endpoint_adapters import DatabaseChatEndpointAdapters
from backend.database import get_db
from backend.dependencies import get_character_service_dependency, get_logger, get_chat_endpoint_adapters, get_reliable_chat_manager, get_database_chat_endpoint_adapters, get_database_chat_manager # Import dependencies
from backend.log_manager import LogManager
import logging

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

router = APIRouter(
    prefix="/api",
    tags=["chat"],
    responses=STANDARD_RESPONSES
)

@router.post("/create-new-chat", response_model=DataResponse[pydantic_models.ChatSessionReadV2], status_code=201)
def create_new_chat_endpoint(
    payload: pydantic_models.ChatSessionCreateV2, # character_uuid, user_uuid (optional), title (optional)
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Create a new chat session using database storage (Phase 2 implementation)."""
    try:
        # 1. Validate character exists
        character = character_service.get_character_by_uuid(payload.character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found: {payload.character_uuid}")

        # 2. Create DB record for the chat session (database-first approach)
        session_uuid = str(uuid.uuid4())
        
        db_chat_session = sql_models.ChatSession(
            chat_session_uuid=session_uuid,
            character_uuid=payload.character_uuid,
            user_uuid=payload.user_uuid,
            title=payload.title or f"Chat with {character.name}",
            start_time=datetime.datetime.utcnow(),
            message_count=0,
            export_format_version=payload.export_format_version or "1.1.0",
            is_archived=payload.is_archived or False
        )
        
        db.add(db_chat_session)
        db.commit()
        db.refresh(db_chat_session)

        # 3. Create initial system message if needed
        if character.description or character.personality:
            system_content = f"Character: {character.name}\n"
            if character.description:
                system_content += f"Description: {character.description}\n"
            if character.personality:
                system_content += f"Personality: {character.personality}\n"
            
            chat_service.create_chat_message(
                db=db,
                chat_session_uuid=session_uuid,
                role="system",
                content=system_content.strip(),
                status="complete"
            )

        # 4. Return the session with empty messages list
        session_response = pydantic_models.ChatSessionReadV2(
            chat_session_uuid=db_chat_session.chat_session_uuid,
            character_uuid=db_chat_session.character_uuid,
            user_uuid=db_chat_session.user_uuid,
            start_time=db_chat_session.start_time,
            last_message_time=db_chat_session.last_message_time,
            message_count=db_chat_session.message_count,
            title=db_chat_session.title,
            export_format_version=db_chat_session.export_format_version,
            is_archived=db_chat_session.is_archived,
            messages=[]
        )

        return create_data_response(session_response)
    
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "creating new chat session")

@router.post("/load-latest-chat", response_model=DataResponse[Optional[pydantic_models.ChatSessionReadV2]])
def load_latest_chat_endpoint(
    payload: pydantic_models.CharacterUUIDPayload, # Use the new Pydantic model for the request body
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Load the latest chat session for a character using database storage (Phase 2 implementation)."""
    try:
        # Get the latest session from database
        latest_session = chat_service.get_latest_chat_session_for_character(db=db, character_uuid=payload.character_uuid)
        if not latest_session:
            # As per user clarification, robustly tolerate this. Frontend might call create-new-chat.
            # Returning None (which FastAPI converts to 200 OK with null body) or explicit 404.
            # For now, let's return None, which will be an empty 200 if no session.
            return create_data_response(None)
        
        # Load the actual messages from the database
        db_messages = chat_service.get_chat_messages(db=db, chat_session_uuid=latest_session.chat_session_uuid)
        
        # Convert database messages to Pydantic models
        message_responses = [
            pydantic_models.ChatMessageRead(
                message_id=msg.message_id,
                chat_session_uuid=msg.chat_session_uuid,
                role=msg.role,
                content=msg.content,
                status=msg.status,
                reasoning_content=msg.reasoning_content,
                metadata_json=msg.metadata_json,
                timestamp=msg.timestamp,
                created_at=msg.created_at,
                updated_at=msg.updated_at
            )
            for msg in db_messages
        ]
        
        # Create the session response with messages
        session_response = pydantic_models.ChatSessionReadV2(
            chat_session_uuid=latest_session.chat_session_uuid,
            character_uuid=latest_session.character_uuid,
            user_uuid=latest_session.user_uuid,
            start_time=latest_session.start_time,
            last_message_time=latest_session.last_message_time,
            message_count=latest_session.message_count,
            title=latest_session.title,
            export_format_version=latest_session.export_format_version,
            is_archived=latest_session.is_archived,
            messages=message_responses
        )
        
        return create_data_response(session_response)
    
    except Exception as e:
        raise handle_generic_error(e, "loading latest chat")

@router.post("/save-chat", response_model=DataResponse[pydantic_models.ChatSessionReadV2])
def save_chat_endpoint(
    payload: pydantic_models.ChatSavePayload,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Save chat messages to database storage (Phase 2 implementation)."""
    try:
        # 1. Get the existing chat session from DB
        db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
        if not db_chat_session:
            raise NotFoundException(f"ChatSession not found: {payload.chat_session_uuid}")

        # 2. Clear existing messages for this session (replace all)
        existing_messages = chat_service.get_chat_messages(db=db, chat_session_uuid=payload.chat_session_uuid)
        for msg in existing_messages:
            chat_service.delete_chat_message(db=db, message_id=msg.message_id)

        # 3. Save new messages to database
        saved_messages = []
        for message_data in payload.messages:
            # Extract message fields from the dict format
            role = message_data.get('role', 'user')
            content = message_data.get('content', '') or message_data.get('text', '')
            status = message_data.get('status', 'complete')
            reasoning_content = message_data.get('reasoning_content')
            metadata_json = message_data.get('metadata')
            
            # Create message in database
            db_message = chat_service.create_chat_message(
                db=db,
                chat_session_uuid=payload.chat_session_uuid,
                role=role,
                content=content,
                status=status,
                reasoning_content=reasoning_content,
                metadata_json=metadata_json
            )
            saved_messages.append(db_message)

        # 4. Update ChatSession DB record (title, message_count)
        if payload.title is not None:
            update_data = pydantic_models.ChatSessionUpdateV2(
                title=payload.title,
                message_count=len(payload.messages)
            )
            updated_session = chat_service.update_chat_session(
                db,
                chat_session_uuid=payload.chat_session_uuid,
                chat_update=update_data
            )
        else:
            # Just update message count
            db_chat_session.message_count = len(payload.messages)
            db_chat_session.last_message_time = datetime.datetime.utcnow()
            db.commit()
            db.refresh(db_chat_session)
            updated_session = db_chat_session
        
        if not updated_session:
            # This would be unusual if the session existed before
            raise ValidationException("Failed to update chat session in database after saving log")

        # 5. Convert saved messages to ChatMessageRead format
        message_reads = []
        for db_message in saved_messages:
            message_read = pydantic_models.ChatMessageRead(
                message_id=db_message.message_id,
                chat_session_uuid=db_message.chat_session_uuid,
                role=db_message.role,
                content=db_message.content,
                status=db_message.status,
                reasoning_content=db_message.reasoning_content,
                metadata_json=db_message.metadata_json,
                timestamp=db_message.timestamp,
                created_at=db_message.created_at,
                updated_at=db_message.updated_at
            )
            message_reads.append(message_read)

        # 6. Return the updated session with messages
        session_read_v2 = pydantic_models.ChatSessionReadV2(
            chat_session_uuid=updated_session.chat_session_uuid,
            character_uuid=updated_session.character_uuid,
            user_uuid=updated_session.user_uuid,
            start_time=updated_session.start_time,
            last_message_time=updated_session.last_message_time,
            message_count=updated_session.message_count,
            title=updated_session.title,
            export_format_version=updated_session.export_format_version,
            is_archived=updated_session.is_archived,
            messages=message_reads
        )
        
        return create_data_response(session_read_v2)
    
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "saving chat")

@router.post("/append-chat-message", response_model=DataResponse[pydantic_models.ChatSessionReadV2])
def append_chat_message_endpoint(
    payload: pydantic_models.ChatMessageAppend,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Append a new message to chat session using database storage (Phase 2 implementation)."""
    try:
        # 1. Get the existing chat session from DB
        db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
        if not db_chat_session:
            raise NotFoundException(f"ChatSession not found: {payload.chat_session_uuid}")

        # 2. Extract message fields from the dict format
        message_data = payload.message
        role = message_data.get('role', 'user')
        content = message_data.get('content', '') or message_data.get('text', '')
        status = message_data.get('status', 'complete')
        reasoning_content = message_data.get('reasoning_content')
        metadata_json = message_data.get('metadata')

        # 3. Create the new message in database
        db_message = chat_service.create_chat_message(
            db=db,
            chat_session_uuid=payload.chat_session_uuid,
            role=role,
            content=content,
            status=status,
            reasoning_content=reasoning_content,
            metadata_json=metadata_json
        )

        # 4. Update ChatSession DB record (message_count, last_message_time)
        # The create_chat_message function already updates the session metadata
        # But let's refresh to get the latest data
        db.refresh(db_chat_session)
        updated_session = db_chat_session

        # 5. Convert to ChatSessionReadV2 format with the new message
        db_messages = chat_service.get_chat_messages(db=db, chat_session_uuid=payload.chat_session_uuid)
        
        # Convert database messages to Pydantic models
        message_responses = [
            pydantic_models.ChatMessageRead(
                message_id=msg.message_id,
                chat_session_uuid=msg.chat_session_uuid,
                role=msg.role,
                content=msg.content,
                status=msg.status,
                reasoning_content=msg.reasoning_content,
                metadata_json=msg.metadata_json,
                timestamp=msg.timestamp,
                created_at=msg.created_at,
                updated_at=msg.updated_at
            )
            for msg in db_messages
        ]
        
        # Create the session response with messages
        session_response = pydantic_models.ChatSessionReadV2(
            chat_session_uuid=updated_session.chat_session_uuid,
            character_uuid=updated_session.character_uuid,
            user_uuid=updated_session.user_uuid,
            start_time=updated_session.start_time,
            last_message_time=updated_session.last_message_time,
            message_count=updated_session.message_count,
            title=updated_session.title,
            export_format_version=updated_session.export_format_version,
            is_archived=updated_session.is_archived,
            messages=message_responses
        )

        return create_data_response(session_response)
    
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "appending chat message")

@router.post("/chat/generate", response_model=DataResponse[pydantic_models.ChatGenerateResponse])
async def generate_chat_response_endpoint( # Made async to accommodate potential async API calls
    payload: pydantic_models.ChatGenerateRequest,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
    # api_handler: APIHandler = Depends(get_api_handler) # Assuming a dependency for api_handler
):
    """Generate chat response using database storage (Phase 2 implementation)."""
    try:
        # 1. Get the existing chat session from DB
        db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
        if not db_chat_session:
            raise NotFoundException(f"ChatSession not found: {payload.chat_session_uuid}")

        # 2. Get character data
        character = character_service.get_character_by_uuid(db_chat_session.character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found for session: {db_chat_session.character_uuid}")

        # 3. Prepare data for generation (character info, current context)
        # This would involve formatting `payload.current_context` and character details
        # into a prompt suitable for the language model.
        
        # --- Placeholder for LLM interaction ---
        # generated_text = await api_handler.generate_text(
        #     prompt=formatted_prompt,
        #     character_details=character.data # or specific fields
        # )
        # For now, using a dummy response:
        generated_text = f"This is a generated response for {character.name} based on the context."
        # --- End Placeholder ---

        if not generated_text:
            raise ValidationException("Failed to generate chat response from LLM")

        # 4. Format the generated response as a message dictionary
        # Convert to database-compatible format
        assistant_message = {
            "role": "assistant",
            "content": generated_text,
            "status": "complete"
        }

        # 5. Save the generated message to database
        db_message = chat_service.create_chat_message(
            db=db,
            chat_session_uuid=payload.chat_session_uuid,
            role="assistant",
            content=generated_text,
            status="complete"
        )

        # 6. Get updated session data
        db.refresh(db_chat_session)
        updated_session = db_chat_session

        # 7. Return the generated message in the expected format
        # Convert back to the format expected by the frontend
        response_message = {"assistant": generated_text}
        response_data = pydantic_models.ChatGenerateResponse(
            chat_session_uuid=payload.chat_session_uuid,
            generated_message=response_message
        )
        return create_data_response(response_data)
    
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "generating chat response")

@router.post("/list-character-chats", response_model=DataResponse[List[Dict]])
def list_character_chats_endpoint(
    payload: dict,  # Accept the payload structure from frontend
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """List all chats for a specific character using database-only implementation"""
    try:
        character_data = payload.get("character_data")
        if not character_data:
            raise ValidationException("character_data is required")
            
        character_uuid = character_data.get("data", {}).get("character_uuid")
        if not character_uuid:
            raise ValidationException("character_uuid is required in character_data")
        
        # Use database chat adapters
        result = chat_adapters.list_character_chats_endpoint(character_uuid)
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(result.error_message)
        
        return create_data_response(result.chat_sessions)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "listing character chats")

# --- Existing ChatSession CRUD ---
# These routes use /chat_sessions/ prefix and are kept as is.

@router.post("/chat_sessions/", response_model=DataResponse[pydantic_models.ChatSessionRead], status_code=201)
def create_chat_session_endpoint(
    chat_session: pydantic_models.ChatSessionCreate, # This is the old endpoint, distinct from /create-new-chat
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    try:
        result = chat_service.create_chat_session(db=db, chat_session=chat_session)
        return create_data_response(result)
    except Exception as e:
        raise handle_generic_error(e, "creating chat session")

@router.get("/chat_sessions/{session_id}", response_model=DataResponse[pydantic_models.ChatSessionRead])
def read_chat_session_endpoint(
    session_id: str, 
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    try:
        db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=session_id)
        if db_chat_session is None:
            raise NotFoundException("ChatSession not found")
        return create_data_response(db_chat_session)
    except NotFoundException:
        raise
    except Exception as e:
        raise handle_generic_error(e, "reading chat session")

@router.get("/chat_sessions/", response_model=ListResponse[pydantic_models.ChatSessionRead])
def read_chat_sessions_endpoint(
    skip: int = 0,
    limit: int = 100,
    character_uuid: Optional[str] = None,
    user_uuid: Optional[str] = None,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    try:
        chat_sessions = chat_service.get_chat_sessions(
            db, skip=skip, limit=limit, character_uuid=character_uuid, user_uuid=user_uuid
        )
        return create_list_response(chat_sessions, total=len(chat_sessions))
    except Exception as e:
        raise handle_generic_error(e, "reading chat sessions")

@router.put("/chat_sessions/{session_id}", response_model=DataResponse[pydantic_models.ChatSessionRead])
def update_chat_session_endpoint(
    session_id: str,
    chat_update: pydantic_models.ChatSessionUpdate,
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    try:
        db_chat_session = chat_service.update_chat_session(db, chat_session_uuid=session_id, chat_update=chat_update)
        if db_chat_session is None:
            raise NotFoundException("ChatSession not found")
        return create_data_response(db_chat_session)
    except NotFoundException:
        raise
    except Exception as e:
        raise handle_generic_error(e, "updating chat session")

@router.delete("/chat_sessions/{session_id}", response_model=DataResponse[pydantic_models.ChatSessionRead]) # Or just status_code=204
def delete_chat_session_endpoint(
    session_id: str, 
    db: Session = Depends(get_db),
    logger: LogManager = Depends(get_logger)
):
    try:
        db_chat_session = chat_service.delete_chat_session(db, chat_session_uuid=session_id)
        if db_chat_session is None:
            raise NotFoundException("ChatSession not found")
        # Returning the deleted object can be useful, or just a success status.
        # If just status, change response_model and return type.
        return create_data_response(db_chat_session)
    except NotFoundException:
        raise
    except Exception as e:
        raise handle_generic_error(e, "deleting chat session")

@router.post("/delete-chat", response_model=DataResponse[bool])
def delete_chat_endpoint(
    payload: dict,  # Accept the payload structure from frontend
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """Delete a specific chat session using database-only implementation."""
    try:
        chat_id = payload.get("chat_id")
        if not chat_id:
            raise ValidationException("chat_id is required")
        
        # Use database chat adapters
        result = chat_adapters.delete_chat_endpoint(chat_id)
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(result.error_message)
        
        return create_data_response(True)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "deleting chat")

# === RELIABLE CHAT MANAGER ENDPOINTS ===
# These endpoints provide the new reliable chat persistence system
# They run in parallel with existing endpoints during transition

def safe_timestamp_to_datetime(timestamp: int, logger: LogManager = None) -> datetime.datetime:
    """
    Safely convert timestamp to datetime, handling both seconds and milliseconds.
    """
    try:
        # If timestamp looks like milliseconds (> 1e10), convert to seconds
        if timestamp > 1e10:
            timestamp = timestamp / 1000
        return datetime.datetime.fromtimestamp(timestamp)
    except (OSError, ValueError) as e:
        # Fallback to current time if conversion fails
        if logger:
            logger.log_warning(f"Failed to convert timestamp {timestamp}: {e}. Using current time.")
        return datetime.datetime.utcnow()

@router.post("/reliable-create-chat", response_model=DataResponse[pydantic_models.ChatSessionRead], status_code=201)
def reliable_create_chat_endpoint(
    payload: pydantic_models.ChatSessionCreate,
    db: Session = Depends(get_db),
    chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """
    Create a new chat session using the ReliableChatManager.
    This is the reliable version of create-new-chat endpoint.
    """
    try:
        logger.log_info(f"Creating new reliable chat session for character: {payload.character_uuid}")
        
        # 1. Validate character exists
        character = character_service.get_character_by_uuid(payload.character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found: {payload.character_uuid}")
        
        # 2. Create chat session using ReliableChatManager
        result = chat_adapters.create_chat_session(
            character_uuid=payload.character_uuid,
            user_uuid=payload.user_uuid,
            title=payload.title
        )
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to create reliable chat session: {result.error_message}")
        
        logger.log_info(f"Successfully created reliable chat session: {result.chat_metadata.chat_session_uuid}")
        
        # 3. Convert to Pydantic model for response
        session_response = pydantic_models.ChatSessionRead(
            chat_session_uuid=result.chat_metadata.chat_session_uuid,
            character_uuid=result.chat_metadata.character_uuid,
            user_uuid=result.chat_metadata.user_uuid,
            title=result.chat_metadata.title,
            start_time=safe_timestamp_to_datetime(result.chat_metadata.created_timestamp, logger),
            last_message_time=result.chat_metadata.last_message_time,
            message_count=result.chat_metadata.message_count,
            chat_log_path=result.chat_metadata.chat_log_path
        )
        
        return create_data_response(session_response)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_create_chat_endpoint: {str(e)}")
        raise handle_generic_error(e, "creating reliable chat session")

@router.post("/reliable-load-chat", response_model=DataResponse[Optional[pydantic_models.ChatSessionRead]])
def reliable_load_chat_endpoint(
    payload: pydantic_models.CharacterUUIDPayload,
    db: Session = Depends(get_db),
    reliable_chat_manager: DatabaseReliableChatManager = Depends(get_database_chat_manager),
    chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    Load the latest chat session for a character using ReliableChatManager.
    This is the reliable version of load-latest-chat endpoint.
    """
    try:
        logger.log_info(f"Loading latest reliable chat for character: {payload.character_uuid}")
        
        # Load latest chat session using ReliableChatManager
        result = chat_adapters.load_latest_chat_session(payload.character_uuid)
        
        if result.result == ChatOperationResult.NOT_FOUND:
            logger.log_info(f"No chat sessions found for character: {payload.character_uuid}")
            return create_data_response(None)
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to load reliable chat session: {result.error_message}")
        
        logger.log_info(f"Successfully loaded reliable chat session: {result.chat_metadata.chat_session_uuid}")
        
        # Convert to Pydantic model for response
        session_response = pydantic_models.ChatSessionRead(
            chat_session_uuid=result.chat_metadata.chat_session_uuid,
            character_uuid=result.chat_metadata.character_uuid,
            user_uuid=result.chat_metadata.user_uuid,
            title=result.chat_metadata.title,
            start_time=safe_timestamp_to_datetime(result.chat_metadata.created_timestamp, logger),
            last_message_time=result.chat_metadata.last_message_time,
            message_count=result.chat_metadata.message_count,
            chat_log_path=result.chat_metadata.chat_log_path,
            messages=result.messages if hasattr(result, 'messages') and result.messages else None,
            success=True if hasattr(result, 'messages') and result.messages else None
        )
        
        return create_data_response(session_response)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_load_chat_endpoint: {str(e)}")
        raise handle_generic_error(e, "loading reliable chat session")

@router.post("/reliable-append-message", response_model=DataResponse[pydantic_models.ChatSessionRead])
def reliable_append_message_endpoint(
    payload: pydantic_models.ChatMessageAppend,
    db: Session = Depends(get_db),
    chat_endpoint_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    Append a message to a chat session using ReliableChatManager.
    This is the reliable version of append-chat-message endpoint.
    """
    try:
        logger.log_info(f"Appending message to reliable chat session: {payload.chat_session_uuid}")
        
        # Convert Pydantic message to ChatMessage
        chat_message = ChatMessage(
            id=payload.message.get('id', str(uuid.uuid4())),
            role=payload.message.get('role', 'user'),
            content=payload.message.get('content', ''),
            timestamp=payload.message.get('timestamp', int(time.time() * 1000)),
            status=payload.message.get('status', 'complete'),
            variations=payload.message.get('variations'),
            current_variation=payload.message.get('current_variation'),
            metadata=payload.message.get('metadata')
        )
        
        # Append message using ChatEndpointAdapters
        result = chat_endpoint_adapters.append_message_endpoint(payload.chat_session_uuid, chat_message)
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to append message to reliable chat: {result.error_message}")
        
        logger.log_info(f"Successfully appended message to reliable chat session: {payload.chat_session_uuid}")
        
        # Load the updated chat session to get current metadata
        load_result = chat_endpoint_adapters.load_chat_endpoint(payload.chat_session_uuid)
        if load_result.result != ChatOperationResult.SUCCESS or load_result.chat_metadata is None:
            raise ValidationException(f"Failed to load updated chat metadata: {load_result.error_message}")
        
        # Convert updated metadata to Pydantic model
        session_response = pydantic_models.ChatSessionRead(
            chat_session_uuid=load_result.chat_metadata.chat_session_uuid,
            character_uuid=load_result.chat_metadata.character_uuid,
            user_uuid=load_result.chat_metadata.user_uuid,
            title=load_result.chat_metadata.title,
            start_time=safe_timestamp_to_datetime(load_result.chat_metadata.created_timestamp, logger),
            last_message_time=load_result.chat_metadata.last_message_time,
            message_count=load_result.chat_metadata.message_count,
            chat_log_path=load_result.chat_metadata.chat_log_path
        )
        
        return create_data_response(session_response)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_append_message_endpoint: {str(e)}")
        raise handle_generic_error(e, "appending message to reliable chat")

@router.post("/reliable-save-chat", response_model=DataResponse[pydantic_models.ChatSessionRead])
def reliable_save_chat_endpoint(
    payload: pydantic_models.ChatSavePayload,
    db: Session = Depends(get_db),
    chat_endpoint_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    Save chat messages using ReliableChatManager.
    This is the reliable version of save-chat endpoint.
    """
    try:
        # Convert Pydantic messages to ChatMessage objects
        chat_messages = []
        for msg_dict in payload.messages:
            chat_message = ChatMessage(
                id=msg_dict.get('id', str(uuid.uuid4())),
                role=msg_dict.get('role', 'user'),
                content=msg_dict.get('content', ''),
                timestamp=msg_dict.get('timestamp', int(time.time() * 1000)),
                status=msg_dict.get('status', 'complete'),
                variations=msg_dict.get('variations'),
                current_variation=msg_dict.get('current_variation'),
                metadata=msg_dict.get('metadata')
            )
            chat_messages.append(chat_message)
        
        # Save messages using ChatEndpointAdapters
        result = chat_endpoint_adapters.save_chat_session(
            chat_session_uuid=payload.chat_session_uuid,
            messages=chat_messages,
            title=payload.title
        )
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to save reliable chat session: {result.error_message}")
        
        logger.log_info(f"Successfully saved reliable chat session: {payload.chat_session_uuid}")
        
        # Convert updated metadata to Pydantic model
        session_response = pydantic_models.ChatSessionRead(
            chat_session_uuid=result.chat_metadata.chat_session_uuid,
            character_uuid=result.chat_metadata.character_uuid,
            user_uuid=result.chat_metadata.user_uuid,
            title=result.chat_metadata.title,
            start_time=safe_timestamp_to_datetime(result.chat_metadata.created_timestamp, logger),
            last_message_time=result.chat_metadata.last_message_time,
            message_count=result.chat_metadata.message_count,
            chat_log_path=result.chat_metadata.chat_log_path
        )
        
        return create_data_response(session_response)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_save_chat_endpoint: {str(e)}")
        raise handle_generic_error(e, "saving reliable chat session")

@router.get("/reliable-list-chats/{character_uuid}", response_model=ListResponse[pydantic_models.ChatSessionRead])
def reliable_list_chats_endpoint(
    character_uuid: str,
    db: Session = Depends(get_db),
    chat_endpoint_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    List all chat sessions for a character using ReliableChatManager.
    This is the reliable version for listing chats.
    """
    try:
        logger.log_info(f"Listing reliable chat sessions for character: {character_uuid}")
        
        # List chat sessions using ChatEndpointAdapters
        result = chat_endpoint_adapters.list_chat_sessions(character_uuid)
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to list reliable chat sessions: {result.error_message}")
        
        # Convert to Pydantic models
        session_responses = []
        for metadata in result.chat_sessions:
            session_response = pydantic_models.ChatSessionRead(
                chat_session_uuid=metadata.chat_session_uuid,
                character_uuid=metadata.character_uuid,
                user_uuid=metadata.user_uuid,
                title=metadata.title,
                start_time=safe_timestamp_to_datetime(metadata.created_timestamp, logger),
                last_message_time=metadata.last_message_time,
                message_count=metadata.message_count,
                chat_log_path=metadata.chat_log_path
            )
            session_responses.append(session_response)
        
        logger.log_info(f"Successfully listed {len(session_responses)} reliable chat sessions for character: {character_uuid}")
        
        return create_list_response(session_responses)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_list_chats_endpoint: {str(e)}")
        raise handle_generic_error(e, "listing reliable chat sessions")

@router.delete("/reliable-delete-chat/{chat_session_uuid}", response_model=DataResponse[bool])
def reliable_delete_chat_endpoint(
    chat_session_uuid: str,
    db: Session = Depends(get_db),
    chat_endpoint_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    Delete a chat session using ReliableChatManager.
    This is the reliable version of chat deletion.
    """
    try:
        logger.log_info(f"Deleting reliable chat session: {chat_session_uuid}")
        
        # Delete chat session using ChatEndpointAdapters
        result = chat_endpoint_adapters.delete_chat_session(chat_session_uuid)
        
        if result.result == ChatOperationResult.NOT_FOUND:
            raise NotFoundException(f"Chat session not found: {chat_session_uuid}")
        
        if result.result != ChatOperationResult.SUCCESS:
            raise ValidationException(f"Failed to delete reliable chat session: {result.error_message}")
        
        logger.log_info(f"Successfully deleted reliable chat session: {chat_session_uuid}")
        
        return create_data_response(True)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in reliable_delete_chat_endpoint: {str(e)}")
        raise handle_generic_error(e, "deleting reliable chat session")

@router.post("/load-chat", response_model=DataResponse[Optional[Dict[str, Any]]])
def load_chat_endpoint(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """
    Load a specific chat by ID or the active chat for a character.
    This endpoint uses database-only implementation.
    """
    try:
        logger.log_info(f"Loading chat with payload: {payload}")
        
        # Extract parameters from payload
        chat_id = payload.get('chat_id')
        character_data = payload.get('character_data')
        use_active = payload.get('use_active', False)
        
        if not character_data:
            raise ValidationException("Missing character_data in request")
        
        # Extract character UUID from character_data
        character_uuid = None
        if isinstance(character_data, dict):
            # Try different possible locations for character_uuid
            character_uuid = (
                character_data.get('character_uuid') or
                character_data.get('uuid') or
                (character_data.get('data', {}).get('character_uuid')) or
                (character_data.get('data', {}).get('uuid'))
            )
        
        if not character_uuid:
            raise ValidationException("Missing character_uuid in character_data")
        
        logger.log_info(f"Loading chat for character: {character_uuid}, chat_id: {chat_id}, use_active: {use_active}")
        
        # Get character from database
        character = character_service.get_character_by_uuid(character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found: {character_uuid}")
        
        # Determine which chat to load
        target_chat_id = chat_id
        if not target_chat_id or use_active:
            # Get latest chat for character
            chat_sessions = chat_service.get_chat_sessions_by_character(db, character_uuid)
            if not chat_sessions:
                logger.log_info(f"No chat found for character: {character_uuid}")
                return create_data_response({"success": False, "error": "No chat found"})
            # Sort by last message time and get the most recent
            chat_sessions.sort(key=lambda x: x.last_message_time or x.start_time, reverse=True)
            target_chat_id = chat_sessions[0].chat_session_uuid
        
        # Use database chat adapters to load the chat
        result = chat_adapters.load_chat_endpoint(target_chat_id)
        
        if result.result != ChatOperationResult.SUCCESS:
            logger.log_info(f"Failed to load chat: {result.error_message}")
            return create_data_response({"success": False, "error": result.error_message})
        
        # Add character data to the response
        chat_data = {
            "metadata": result.chat_metadata.to_dict() if result.chat_metadata else {},
            "messages": result.messages or []
        }
        chat_data["character_data"] = {
            "character_uuid": character.character_uuid,
            "uuid": character.character_uuid,
            "data": {
                "name": character.name,
                "description": character.description,
                "personality": character.personality
            }
        }
        
        logger.log_info(f"Successfully loaded chat for character: {character_uuid}")
        return create_data_response(chat_data)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in load_chat_endpoint: {str(e)}")
        raise handle_generic_error(e, "loading chat")


# === EXPORT ENDPOINTS ===

@router.get("/export-chat/{chat_session_uuid}", response_model=DataResponse[Dict[str, Any]])
def export_chat_to_jsonl_endpoint(
    chat_session_uuid: str,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """
    Export a specific chat session to JSONL format.
    Returns the JSONL content as a string that can be downloaded.
    """
    try:
        logger.log_info(f"Exporting chat to JSONL: {chat_session_uuid}")
        
        # Get chat session
        chat_session = chat_service.get_chat_session(db, chat_session_uuid)
        if not chat_session:
            raise NotFoundException(f"Chat session not found: {chat_session_uuid}")
        
        # Get character
        character = character_service.get_character_by_uuid(chat_session.character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found: {chat_session.character_uuid}")
        
        # Get messages
        messages = chat_service.get_chat_messages(db, chat_session_uuid)
        
        # Generate JSONL content
        jsonl_lines = []
        
        # Add metadata line (first line)
        metadata_line = {
            "type": "metadata",
            "chat_session_uuid": chat_session.chat_session_uuid,
            "character_uuid": chat_session.character_uuid,
            "character_name": character.name,
            "user_uuid": chat_session.user_uuid,
            "title": chat_session.title,
            "created_timestamp": int(chat_session.start_time.timestamp() * 1000) if chat_session.start_time else None,
            "last_message_time": int(chat_session.last_message_time.timestamp() * 1000) if chat_session.last_message_time else None,
            "message_count": chat_session.message_count,
            "export_format_version": chat_session.export_format_version or "1.1.0",
            "exported_at": int(datetime.now().timestamp() * 1000)
        }
        jsonl_lines.append(json.dumps(metadata_line))
        
        # Add message lines
        for msg in messages:
            message_line = {
                "type": "message",
                "id": msg.message_id,
                "role": msg.role,
                "content": msg.content,
                "timestamp": int(msg.created_at.timestamp() * 1000) if msg.created_at else None,
                "status": msg.status or "complete",
                "reasoning_content": msg.reasoning_content,
                "variations": msg.metadata_json.get('variations', []) if msg.metadata_json else [],
                "current_variation": msg.metadata_json.get('current_variation', 0) if msg.metadata_json else 0,
                "metadata": msg.metadata_json or {}
            }
            jsonl_lines.append(json.dumps(message_line))
        
        # Join lines with newlines
        jsonl_content = "\n".join(jsonl_lines)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"chat_{character.name}_{timestamp}.jsonl"
        
        logger.log_info(f"Successfully exported chat {chat_session_uuid} to JSONL")
        
        return create_data_response({
            "content": jsonl_content,
            "filename": filename,
            "chat_title": chat_session.title,
            "character_name": character.name,
            "message_count": len(messages)
        })
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error exporting chat to JSONL: {str(e)}")
        raise handle_generic_error(e, "exporting chat to JSONL")


@router.post("/export-chats-bulk", response_model=DataResponse[Dict[str, Any]])
def export_chats_bulk_endpoint(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """
    Export multiple chat sessions for a character to JSONL format.
    Payload should contain: { "character_uuid": "...", "chat_ids": [...] (optional) }
    If chat_ids is not provided, exports all chats for the character.
    """
    try:
        character_uuid = payload.get("character_uuid")
        chat_ids = payload.get("chat_ids")  # Optional - if not provided, export all
        
        if not character_uuid:
            raise ValidationException("Missing character_uuid in request")
        
        logger.log_info(f"Bulk exporting chats for character: {character_uuid}")
        
        # Get character
        character = character_service.get_character_by_uuid(character_uuid, db)
        if not character:
            raise NotFoundException(f"Character not found: {character_uuid}")
        
        # Get chat sessions
        if chat_ids:
            # Export specific chats
            chat_sessions = []
            for chat_id in chat_ids:
                session = chat_service.get_chat_session(db, chat_id)
                if session and session.character_uuid == character_uuid:
                    chat_sessions.append(session)
        else:
            # Export all chats for character
            chat_sessions = chat_service.get_chat_sessions_for_character(db, character_uuid)
        
        if not chat_sessions:
            raise NotFoundException("No chat sessions found for export")
        
        # Generate combined JSONL content
        all_jsonl_lines = []
        total_messages = 0
        
        for chat_session in chat_sessions:
            # Get messages for this chat
            messages = chat_service.get_chat_messages(db, chat_session.chat_session_uuid)
            
            # Add separator comment for multiple chats
            if len(chat_sessions) > 1:
                separator_line = {
                    "type": "separator",
                    "chat_session_uuid": chat_session.chat_session_uuid,
                    "title": chat_session.title
                }
                all_jsonl_lines.append(json.dumps(separator_line))
            
            # Add metadata line
            metadata_line = {
                "type": "metadata",
                "chat_session_uuid": chat_session.chat_session_uuid,
                "character_uuid": chat_session.character_uuid,
                "character_name": character.name,
                "user_uuid": chat_session.user_uuid,
                "title": chat_session.title,
                "created_timestamp": int(chat_session.start_time.timestamp() * 1000) if chat_session.start_time else None,
                "last_message_time": int(chat_session.last_message_time.timestamp() * 1000) if chat_session.last_message_time else None,
                "message_count": chat_session.message_count,
                "export_format_version": chat_session.export_format_version or "1.1.0"
            }
            all_jsonl_lines.append(json.dumps(metadata_line))
            
            # Add message lines
            for msg in messages:
                message_line = {
                    "type": "message",
                    "id": msg.message_id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": int(msg.created_at.timestamp() * 1000) if msg.created_at else None,
                    "status": msg.status or "complete",
                    "reasoning_content": msg.reasoning_content,
                    "variations": msg.metadata_json.get('variations', []) if msg.metadata_json else [],
                    "current_variation": msg.metadata_json.get('current_variation', 0) if msg.metadata_json else 0,
                    "metadata": msg.metadata_json or {}
                }
                all_jsonl_lines.append(json.dumps(message_line))
            
            total_messages += len(messages)
        
        # Join all lines
        jsonl_content = "\n".join(all_jsonl_lines)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if len(chat_sessions) == 1:
            filename = f"chat_{character.name}_{timestamp}.jsonl"
        else:
            filename = f"chats_{character.name}_{len(chat_sessions)}sessions_{timestamp}.jsonl"
        
        logger.log_info(f"Successfully bulk exported {len(chat_sessions)} chats for character {character_uuid}")
        
        return create_data_response({
            "content": jsonl_content,
            "filename": filename,
            "character_name": character.name,
            "chat_count": len(chat_sessions),
            "total_messages": total_messages
        })
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.log_error(f"Error in bulk export: {str(e)}")
        raise handle_generic_error(e, "bulk exporting chats")