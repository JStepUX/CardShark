from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from backend import models, sql_models
from backend.services import chat_service
from backend.database import get_db

router = APIRouter()

@router.post("/api/chat_sessions/", response_model=models.ChatSessionRead, status_code=201)
def create_chat_session_endpoint(
    chat_session: models.ChatSessionCreate, 
    db: Session = Depends(get_db)
):
    # Basic validation or pre-processing if needed
    # For example, check if character_uuid exists, if user_uuid (if provided) exists.
    # This might be better handled in the service or via DB constraints.
    return chat_service.create_chat_session(db=db, chat_session=chat_session)

@router.get("/api/chat_sessions/{session_id}", response_model=models.ChatSessionRead)
def read_chat_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    db_chat_session = chat_service.get_chat_session(db, chat_session_uuid=session_id)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    return db_chat_session

@router.get("/api/chat_sessions/", response_model=List[models.ChatSessionRead])
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

@router.put("/api/chat_sessions/{session_id}", response_model=models.ChatSessionRead)
def update_chat_session_endpoint(
    session_id: str, 
    chat_update: models.ChatSessionUpdate, 
    db: Session = Depends(get_db)
):
    db_chat_session = chat_service.update_chat_session(db, chat_session_uuid=session_id, chat_update=chat_update)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    return db_chat_session

@router.delete("/api/chat_sessions/{session_id}", response_model=models.ChatSessionRead) # Or just status_code=204
def delete_chat_session_endpoint(session_id: str, db: Session = Depends(get_db)):
    db_chat_session = chat_service.delete_chat_session(db, chat_session_uuid=session_id)
    if db_chat_session is None:
        raise HTTPException(status_code=404, detail="ChatSession not found")
    # Returning the deleted object can be useful, or just a success status.
    # If just status, change response_model and return type.
    return db_chat_session