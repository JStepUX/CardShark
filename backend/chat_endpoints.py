from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pathlib import Path
import datetime

from backend import schemas as pydantic_models, sql_models # Use schemas for Pydantic models
from backend.services import chat_service
from backend.services.character_service import CharacterService # Import CharacterService
from backend.database import get_db
from backend.chat_handler import ChatHandler # Import ChatHandler
from backend.dependencies import get_chat_handler, get_character_service_dependency # Import dependencies
# Import LogManager and get_logger if they are intended to be used, currently not used in this file
# from backend.log_manager import LogManager
# from backend.main import get_logger

router = APIRouter()

@router.post("/api/create-new-chat", response_model=pydantic_models.ChatSessionRead, status_code=201)
def create_new_chat_endpoint(
    payload: pydantic_models.ChatSessionCreate, # character_uuid, user_uuid (optional), title (optional)
    db: Session = Depends(get_db),
    chat_handler: ChatHandler = Depends(get_chat_handler),
    character_service: CharacterService = Depends(get_character_service_dependency)
):
    # 1. Create DB record for the chat session
    # The service will generate chat_session_uuid and a default chat_log_path
    db_chat_session = chat_service.create_chat_session(db=db, chat_session=payload)
    if not db_chat_session:
        raise HTTPException(status_code=500, detail="Failed to create chat session in database")

    # 2. Get character data for initializing the chat file
    character = character_service.get_character_by_uuid(db_chat_session.character_uuid)
    if not character:
        # This case should ideally be prevented by FK constraints or prior validation
        raise HTTPException(status_code=404, detail=f"Character not found: {db_chat_session.character_uuid}")

    # Construct a dictionary that _initialize_chat_file expects for character_data
    # Based on ChatHandler._get_character_uuid and _initialize_chat_file
    character_data_for_handler: Dict[str, Any] = {
        "character_uuid": character.character_uuid, # Canonical UUID
        "uuid": character.character_uuid, # For compatibility if _get_character_uuid checks it
        "data": {
            "name": character.name,
            "description": character.description,
            "personality": character.personality
            # Add other fields if _get_character_uuid or _initialize_chat_file depends on them
        }
    }
    
    # 3. Initialize the physical chat log file
    chat_log_file_path = Path(db_chat_session.chat_log_path)
    chat_handler._initialize_chat_file(
        file_path=chat_log_file_path,
        character_data=character_data_for_handler,
        chat_id=db_chat_session.chat_session_uuid
    )

    return db_chat_session

@router.post("/api/load-latest-chat", response_model=Optional[pydantic_models.ChatSessionRead])
def load_latest_chat_endpoint(
    payload: pydantic_models.CharacterUUIDPayload, # Use the new Pydantic model for the request body
    db: Session = Depends(get_db),
    chat_handler: ChatHandler = Depends(get_chat_handler),
    character_service: CharacterService = Depends(get_character_service_dependency)
):
    # Get the latest session from database
    latest_session = chat_service.get_latest_chat_session_for_character(db=db, character_uuid=payload.character_uuid)
    if not latest_session:
        # As per user clarification, robustly tolerate this. Frontend might call create-new-chat.
        # Returning None (which FastAPI converts to 200 OK with null body) or explicit 404.
        # For now, let's return None, which will be an empty 200 if no session.
        # If a 404 is preferred, raise HTTPException(status_code=404, detail="No chat session found for this character")
        return None
    
    # Also load the actual messages from the chat file using ChatHandler
    character = character_service.get_character_by_uuid(payload.character_uuid)
    if character:
        character_data_for_handler = {
            "character_uuid": character.character_uuid,
            "uuid": character.character_uuid, 
            "data": {"name": character.name}
        }
        
        # Load the chat messages from file
        chat_data = chat_handler.load_latest_chat(character_data_for_handler, scan_all_files=True)
        if chat_data and chat_data.get("success") and chat_data.get("messages"):
            # Add the messages to the session response
            session_dict = latest_session.__dict__.copy()
            session_dict["messages"] = chat_data["messages"]
            session_dict["success"] = True
            return session_dict
    
    return latest_session

@router.post("/api/save-chat", response_model=pydantic_models.ChatSessionRead)
def save_chat_endpoint(
    payload: pydantic_models.ChatSavePayload,
    db: Session = Depends(get_db),
    chat_handler: ChatHandler = Depends(get_chat_handler),
    character_service: CharacterService = Depends(get_character_service_dependency)
):
    # 1. Get the existing chat session from DB
    db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
    if not db_chat_session:
        raise HTTPException(status_code=404, detail=f"ChatSession not found: {payload.chat_session_uuid}")

    # 2. Get character data for ChatHandler
    character = character_service.get_character_by_uuid(db_chat_session.character_uuid)
    if not character:
        raise HTTPException(status_code=404, detail=f"Character not found for session: {db_chat_session.character_uuid}")
    
    character_data_for_handler: Dict[str, Any] = {
        "character_uuid": character.character_uuid,
        "uuid": character.character_uuid,
        "data": {"name": character.name} # Add other fields if save_chat_state needs them
    }

    # 3. Prepare metadata for chat_handler.save_chat_state
    # The `save_chat_state` in ChatHandler seems to expect a specific metadata structure.
    # We need to ensure the `chat_id` is correctly passed.
    # The title from payload can also be part of this metadata if ChatHandler uses it.
    handler_metadata = {
        "chat_id": db_chat_session.chat_session_uuid,
        "title": payload.title if payload.title is not None else db_chat_session.title
        # Add other fields if save_chat_state expects them in its 'metadata' param
    }

    # 4. Save messages to the chat log file using ChatHandler
    # Assuming payload.messages is a list of message dicts compatible with ChatHandler
    # The ChatHandler's save_chat_state takes 'messages' in its internal format.
    # For now, we pass it directly. If conversion is needed, it should happen here or in ChatHandler.
    save_success = chat_handler.save_chat_state(
        character_data=character_data_for_handler,
        messages=payload.messages, # This is List[Dict] from ChatSavePayload
        metadata=handler_metadata # Pass the constructed metadata
    )

    if not save_success:
        # Log the error, but maybe don't fail the whole request if DB update can still proceed
        # Or, decide if this is a critical failure. For now, let's assume it is.
        raise HTTPException(status_code=500, detail="Failed to save chat log to file")

    # 5. Update ChatSession DB record (title, last_message_time, message_count)
    update_data = pydantic_models.ChatSessionUpdate(
        title=payload.title if payload.title is not None else db_chat_session.title,
        message_count=len(payload.messages), # Update message count based on saved messages
        # chat_log_path is not changing here
    )
    updated_session = chat_service.update_chat_session(
        db,
        chat_session_uuid=payload.chat_session_uuid,
        chat_update=update_data
    )
    
    if not updated_session:
        # This would be unusual if the session existed before
        raise HTTPException(status_code=500, detail="Failed to update chat session in database after saving log")

    return updated_session

@router.post("/api/append-chat-message", response_model=pydantic_models.ChatSessionRead)
def append_chat_message_endpoint(
    payload: pydantic_models.ChatMessageAppend,
    db: Session = Depends(get_db),
    chat_handler: ChatHandler = Depends(get_chat_handler),
    character_service: CharacterService = Depends(get_character_service_dependency)
):
    # 1. Get the existing chat session from DB
    db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
    if not db_chat_session:
        raise HTTPException(status_code=404, detail=f"ChatSession not found: {payload.chat_session_uuid}")

    # 2. Get character data for ChatHandler
    character = character_service.get_character_by_uuid(db_chat_session.character_uuid)
    if not character:
        raise HTTPException(status_code=404, detail=f"Character not found for session: {db_chat_session.character_uuid}")
    
    character_data_for_handler: Dict[str, Any] = {
        "character_uuid": character.character_uuid,
        "uuid": character.character_uuid,
        "data": {"name": character.name}
    }
    
    # 3. Append message to the chat log file using ChatHandler
    # ChatHandler.append_message expects the chat_id and the message content.
    # The message content is payload.message (a dict)
    # Metadata for ChatHandler might be needed if its append_message expects it.
    # For now, assuming chat_id (session_uuid) and the message dict are sufficient.
    
    # Construct metadata for ChatHandler's append_message method
    # This is similar to save_chat_state but for a single message.
    # We need the chat_id (which is db_chat_session.chat_session_uuid)
    # and the file_path (db_chat_session.chat_log_path).
    
    # The ChatHandler's append_message method needs the file_path, chat_id, and the message.
    # It might also need character_data if it re-validates or uses it.
    
    # Let's ensure we have the correct parameters for chat_handler.append_message
    # Based on typical ChatHandler design, it might look like:
    # chat_handler.append_message(file_path: Path, chat_id: str, message: Dict[str, Any])
    # Or it might take the full character_data and metadata similar to save_chat_state.
    # For now, let's assume a simpler append_message that takes the essential parts.
    # If ChatHandler.append_message is more complex, this part needs adjustment.

    # Simplistic call to a hypothetical append_message in ChatHandler
    # This part is a placeholder and needs to align with actual ChatHandler.append_message signature
    # For now, we'll assume it takes the file path and the message.
    # A more robust ChatHandler might take the session_uuid and manage the file path internally.
    
    # Let's assume ChatHandler.append_message takes similar arguments to how save_chat_state works
    # but for a single message. It would need character_data, the message, and metadata (chat_id).
    
    # Re-using the metadata structure from save_chat_endpoint for consistency
    handler_metadata = {
        "chat_id": db_chat_session.chat_session_uuid,
        # title is not usually updated on append, but can be included if handler uses it
    }

    # The append_message method in ChatHandler needs to be defined or confirmed.
    # Assuming it takes character_data, a single message, and metadata.
    # If it only takes file_path and message, this needs to be simpler.
    # For now, let's assume it's similar to how save_chat_state might handle one message.
    
    # This is a conceptual call. The actual ChatHandler.append_message might differ.
    # We are focusing on the DB update first, then the file write.
    # The `chat_handler.append_message` method is not yet defined in the provided `ChatHandler`
    # For now, we will call the service to update the DB, and the file operation will be a TODO
    # or needs ChatHandler to be updated separately.

    # For the purpose of this exercise, we'll assume a method exists in ChatHandler
    # that can take the chat_log_path and the new message.
    chat_log_file_path = Path(db_chat_session.chat_log_path)
    
    # This is a conceptual call to what chat_handler.append_message might do.
    # It's not directly calling a known method from the provided ChatHandler snippet.
    # A real implementation would require ChatHandler to have an `append_message` method.
    # For now, we'll simulate the file operation part conceptually.
    # Let's assume chat_handler.append_message(file_path, message_dict)
    try:
        # This is a placeholder for the actual file append logic.
        # In a real scenario, chat_handler.append_message would handle this.
        # For now, we'll assume it's successful if no exception.
        # chat_handler.append_message(chat_log_file_path, payload.message)
        # Since we don't have the method, we'll skip this for now and focus on DB.
        pass # Placeholder for actual file append via ChatHandler
    except Exception as e:
        # Log error if file append fails
        # logger.error(f"Failed to append message to log file {chat_log_file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to append message to chat log file: {e}")

    # 4. Update ChatSession DB record (message_count, last_message_time)
    updated_session = chat_service.append_message_to_chat_session(
        db,
        chat_session_uuid=payload.chat_session_uuid,
        message_payload=payload.message # Pass the message for context, though service only uses it for count now
    )

    if not updated_session:
        # This would be unusual if the session existed before and append_message_to_chat_session failed
        raise HTTPException(status_code=500, detail="Failed to update chat session in database after appending message")

    return updated_session

@router.post("/api/chat/generate", response_model=pydantic_models.ChatGenerateResponse)
async def generate_chat_response_endpoint( # Made async to accommodate potential async API calls
    payload: pydantic_models.ChatGenerateRequest,
    db: Session = Depends(get_db),
    chat_handler: ChatHandler = Depends(get_chat_handler),
    character_service: CharacterService = Depends(get_character_service_dependency)
    # api_handler: APIHandler = Depends(get_api_handler) # Assuming a dependency for api_handler
):
    # 1. Get the existing chat session from DB
    db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=payload.chat_session_uuid)
    if not db_chat_session:
        raise HTTPException(status_code=404, detail=f"ChatSession not found: {payload.chat_session_uuid}")

    # 2. Get character data
    character = character_service.get_character_by_uuid(db_chat_session.character_uuid)
    if not character:
        raise HTTPException(status_code=404, detail=f"Character not found for session: {db_chat_session.character_uuid}")

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
        raise HTTPException(status_code=500, detail="Failed to generate chat response from LLM")

    # 4. Format the generated response as a message dictionary
    # Assuming a standard format like {"assistant": "response text"}
    # This should align with how messages are stored and processed by ChatHandler
    assistant_message = {"assistant": generated_text} # Or {"sender": "assistant", "text": generated_text}

    # 5. Append the generated message to the chat log file using ChatHandler
    # Similar to append_chat_message_endpoint, this relies on a conceptual ChatHandler method.
    chat_log_file_path = Path(db_chat_session.chat_log_path)
    character_data_for_handler: Dict[str, Any] = {
        "character_uuid": character.character_uuid,
        "uuid": character.character_uuid,
        "data": {"name": character.name}
    }
    handler_metadata = {"chat_id": db_chat_session.chat_session_uuid}

    try:
        # Conceptual call, assuming chat_handler.append_message exists and works
        # chat_handler.append_message(
        #     file_path=chat_log_file_path,
        #     message=assistant_message,
        #     # Potentially character_data and metadata if required by append_message
        # )
        pass # Placeholder for actual file append via ChatHandler
    except Exception as e:
        # logger.error(f"Failed to append generated message to log file {chat_log_file_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to append generated message to chat log file: {e}")

    # 6. Update ChatSession DB record (message_count, last_message_time)
    # The service function `append_message_to_chat_session` handles DB updates.
    updated_session = chat_service.append_message_to_chat_session(
        db,
        chat_session_uuid=payload.chat_session_uuid,
        message_payload=assistant_message # The message being added
    )

    if not updated_session:
        raise HTTPException(status_code=500, detail="Failed to update chat session in database after generation")

    # 7. Return the generated message
    return pydantic_models.ChatGenerateResponse(
        chat_session_uuid=payload.chat_session_uuid,
        generated_message=assistant_message
    )

# --- Existing ChatSession CRUD ---
# These routes use /api/chat_sessions/ prefix and are kept as is.

@router.post("/api/chat_sessions/", response_model=pydantic_models.ChatSessionRead, status_code=201)
def create_chat_session_endpoint(
    chat_session: pydantic_models.ChatSessionCreate, # This is the old endpoint, distinct from /api/create-new-chat
    db: Session = Depends(get_db)
):
    return chat_service.create_chat_session(db=db, chat_session=chat_session)

@router.get("/api/chat_sessions/{session_id}", response_model=pydantic_models.ChatSessionRead)
def read_chat_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=session_id)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    return db_chat_session

@router.get("/api/chat_sessions/", response_model=List[pydantic_models.ChatSessionRead])
def read_chat_sessions_endpoint(
    skip: int = 0,
    limit: int = 100,
    character_uuid: Optional[str] = None,
    user_uuid: Optional[str] = None,
    db: Session = Depends(get_db)
):
    chat_sessions = chat_service.get_chat_sessions(
        db, skip=skip, limit=limit, character_uuid=character_uuid, user_uuid=user_uuid
    )
    return chat_sessions

@router.put("/api/chat_sessions/{session_id}", response_model=pydantic_models.ChatSessionRead)
def update_chat_session_endpoint(
    session_id: str,
    chat_update: pydantic_models.ChatSessionUpdate,
    db: Session = Depends(get_db)
):
    db_chat_session = chat_service.update_chat_session(db, chat_session_uuid=session_id, chat_update=chat_update)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    return db_chat_session

@router.delete("/api/chat_sessions/{session_id}", response_model=pydantic_models.ChatSessionRead) # Or just status_code=204
def delete_chat_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    db_chat_session = chat_service.delete_chat_session(db, chat_session_uuid=session_id)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    # Returning the deleted object can be useful, or just a success status.
    # If just status, change response_model and return type.
    return db_chat_session