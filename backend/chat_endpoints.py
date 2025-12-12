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
from backend.services.reliable_chat_manager_db import DatabaseReliableChatManager
from backend.services.database_chat_endpoint_adapters import DatabaseChatEndpointAdapters
from backend.database import get_db
from backend.dependencies import get_character_service_dependency, get_logger, get_database_chat_endpoint_adapters, get_database_chat_manager # Import dependencies
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
    """Create a new chat session using database storage."""
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
    """Load the latest chat session for a character using database storage."""
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

@router.post("/load-chat", response_model=DataResponse[Optional[pydantic_models.ChatSessionReadV2]])
def load_chat_endpoint(
    payload: dict, # Expected: {character_uuid: str, chat_session_uuid: str}
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Load a specific chat session for a character using database storage."""
    try:
        character_uuid = payload.get("character_uuid")
        chat_session_uuid = payload.get("chat_session_uuid")
        
        if not character_uuid or not chat_session_uuid:
             raise ValidationException("character_uuid and chat_session_uuid are required")

        # Get the specific session from database
        session = chat_service.get_chat_session(db=db, chat_session_uuid=chat_session_uuid)
        if not session:
            return create_data_response(None)
            
        if session.character_uuid != character_uuid:
             raise ValidationException("Chat session does not belong to the specified character")
        
        # Load the actual messages from the database
        db_messages = chat_service.get_chat_messages(db=db, chat_session_uuid=session.chat_session_uuid)
        
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
            chat_session_uuid=session.chat_session_uuid,
            character_uuid=session.character_uuid,
            user_uuid=session.user_uuid,
            start_time=session.start_time,
            last_message_time=session.last_message_time,
            message_count=session.message_count,
            title=session.title,
            export_format_version=session.export_format_version,
            is_archived=session.is_archived,
            messages=message_responses
        )
        
        return create_data_response(session_response)
    
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "loading specific chat")

@router.post("/save-chat", response_model=DataResponse[pydantic_models.ChatSessionReadV2])
def save_chat_endpoint(
    payload: pydantic_models.ChatSavePayload,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Save chat messages to database storage."""
    try:
        # 1. Get the existing chat session from DB
        db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
        if not db_chat_session:
            raise NotFoundException(f"ChatSession not found: {payload.chat_session_uuid}")

        # 2. Atomically replace all messages
        # This replaces the previous "Delete All" then "Insert All" logic which was not atomic
        new_db_messages = chat_service.replace_chat_session_messages(
            db=db, 
            chat_session_uuid=payload.chat_session_uuid, 
            messages_data=payload.messages
        )

        # 3. Convert to Pydantic models for response
        message_reads = []
        for db_message in new_db_messages:
            message_reads.append(pydantic_models.ChatMessageRead(
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
            ))

        # 4. Update ChatSession DB record (title)
        # message_count and last_message_time are already updated by replace_chat_session_messages
        updated_session = db_chat_session
        
        if payload.title is not None:
            update_data = pydantic_models.ChatSessionUpdateV2(
                title=payload.title
            )
            updated_session = chat_service.update_chat_session(
                db,
                chat_session_uuid=payload.chat_session_uuid,
                chat_update=update_data
            )
        
        # Refresh to ensure we have latest data
        db.refresh(updated_session)
        
        if not updated_session:
            # This would be unusual if the session existed before
            raise ValidationException("Failed to update chat session in database after saving log")

        # 5. Return the updated session with messages (message_reads already populated above)
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
    """Append a new message to chat session using database storage."""
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
    """Generate chat response using database storage."""
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
    # chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
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
        
        # Use chat_service directly instead of adapters
        sessions = chat_service.get_chat_sessions_by_character(db, character_uuid)
        
        # Convert to list of dicts as expected by frontend
        session_list = []
        for session in sessions:
            session_list.append({
                "chat_session_uuid": session.chat_session_uuid,
                "title": session.title,
                "last_message_time": session.last_message_time,
                "message_count": session.message_count
            })
        
        return create_data_response(session_list)
        
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
    # chat_adapters: DatabaseChatEndpointAdapters = Depends(get_database_chat_endpoint_adapters),
    logger: LogManager = Depends(get_logger)
):
    """Delete a specific chat session using database-only implementation."""
    try:
        chat_id = payload.get("chat_id")
        if not chat_id:
            raise ValidationException("chat_id is required")
        
        # Use chat_service directly
        result = chat_service.delete_chat_session(db, chat_id)
        
        if not result:
            raise NotFoundException("Chat session not found")
        
        return create_data_response(True)
        
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "deleting chat")


# =============================================================================
# RELIABLE ENDPOINT ALIASES
# These are aliases that map the frontend's expected endpoint names to the
# actual database-backed implementations above.
# =============================================================================

@router.post("/reliable-load-chat", response_model=DataResponse[Optional[pydantic_models.ChatSessionReadV2]])
def reliable_load_chat_endpoint(
    payload: dict,  # Can contain character_uuid and optionally chat_session_uuid
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """
    Alias for load-latest-chat / load-chat endpoints.
    If chat_session_uuid is provided, loads that specific chat.
    Otherwise, loads the latest chat for the character.
    """
    try:
        character_uuid = payload.get("character_uuid")
        chat_session_uuid = payload.get("chat_session_uuid")
        
        if not character_uuid:
            raise ValidationException("character_uuid is required")
        
        if chat_session_uuid:
            # Load specific chat
            session = chat_service.get_chat_session(db=db, chat_session_uuid=chat_session_uuid)
            if not session:
                raise NotFoundException("Chat session not found")
            if session.character_uuid != character_uuid:
                raise ValidationException("Chat session does not belong to the specified character")
        else:
            # Load latest chat for character
            session = chat_service.get_latest_chat_session_for_character(db=db, character_uuid=character_uuid)
            if not session:
                raise NotFoundException("No chats found")
        
        # Load the actual messages from the database
        db_messages = chat_service.get_chat_messages(db=db, chat_session_uuid=session.chat_session_uuid)
        
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
            chat_session_uuid=session.chat_session_uuid,
            character_uuid=session.character_uuid,
            user_uuid=session.user_uuid,
            start_time=session.start_time,
            last_message_time=session.last_message_time,
            message_count=session.message_count,
            title=session.title,
            export_format_version=session.export_format_version,
            is_archived=session.is_archived,
            messages=message_responses
        )

        return create_data_response(session_response)

    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        raise handle_generic_error(e, "loading chat (reliable)")


@router.post("/reliable-create-chat", response_model=DataResponse[pydantic_models.ChatSessionReadV2], status_code=201)
def reliable_create_chat_endpoint(
    payload: pydantic_models.ChatSessionCreateV2,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Alias for create-new-chat endpoint."""
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
        raise handle_generic_error(e, "creating new chat session (reliable)")


@router.post("/reliable-save-chat", response_model=DataResponse[pydantic_models.ChatSessionReadV2])
def reliable_save_chat_endpoint(
    payload: pydantic_models.ChatSavePayload,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Alias for save-chat endpoint."""
    return save_chat_endpoint(payload, db, character_service, logger)


@router.get("/reliable-list-chats/{character_id}", response_model=DataResponse[List[Dict]])
def reliable_list_chats_endpoint(
    character_id: str,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Alias for list-character-chats endpoint using path parameter."""
    try:
        # Use chat_service directly
        sessions = chat_service.get_chat_sessions_by_character(db, character_id)
        
        # Convert to list of dicts as expected by frontend
        session_list = []
        for session in sessions:
            session_list.append({
                "chat_session_uuid": session.chat_session_uuid,
                "title": session.title,
                "last_message_time": session.last_message_time,
                "message_count": session.message_count
            })
        
        return create_data_response(session_list)
        
    except Exception as e:
        raise handle_generic_error(e, "listing character chats (reliable)")


@router.post("/reliable-append-message", response_model=DataResponse[pydantic_models.ChatSessionReadV2])
def reliable_append_message_endpoint(
    payload: pydantic_models.ChatMessageAppend,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Alias for append-chat-message endpoint."""
    return append_chat_message_endpoint(payload, db, character_service, logger)


@router.delete("/reliable-delete-chat/{chat_id}", response_model=DataResponse[bool])
def reliable_delete_chat_endpoint(
    chat_id: str,
    db: Session = Depends(get_db),
    character_service: CharacterService = Depends(get_character_service_dependency),
    logger: LogManager = Depends(get_logger)
):
    """Alias for delete-chat endpoint using path parameter."""
    try:
        # Use chat_service directly
        result = chat_service.delete_chat_session(db, chat_id)
        
        if not result:
            raise NotFoundException("Chat session not found")
        
        return create_data_response(True)
        
    except NotFoundException:
        raise
    except Exception as e:
        raise handle_generic_error(e, "deleting chat (reliable)")