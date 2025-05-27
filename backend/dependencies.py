from sqlalchemy.orm import Session
from fastapi import Depends, Request, HTTPException
from typing import cast

from .database import get_db
from .services.character_service import CharacterService
from .png_metadata_handler import PngMetadataHandler
from .settings_manager import SettingsManager
from .log_manager import LogManager
from .chat_handler import ChatHandler # Import ChatHandler

def get_character_service_dependency(request: Request, db: Session = Depends(get_db)) -> CharacterService:
    """
    FastAPI dependency to get an instance of CharacterService.
    Retrieves PngMetadataHandler, SettingsManager, and logger from app.state.
    """
    png_handler = cast(PngMetadataHandler, request.app.state.png_handler)
    settings_manager = cast(SettingsManager, request.app.state.settings_manager)
    logger = cast(LogManager, request.app.state.logger)

    # The following checks might be redundant if you trust the app state to always have these.
    # However, keeping them provides a runtime safeguard.
    if png_handler is None:
        raise HTTPException(status_code=500, detail="PngMetadataHandler not initialized in app.state")
    if settings_manager is None:
        raise HTTPException(status_code=500, detail="SettingsManager not initialized in app.state")
    if logger is None:
        raise HTTPException(status_code=500, detail="LogManager not initialized in app.state")

    return CharacterService(
        db_session=db,
        png_handler=png_handler,
        settings_manager=settings_manager,
        logger=logger
    )

def get_chat_handler(request: Request) -> ChatHandler:
    """
    FastAPI dependency to get an instance of ChatHandler.
    Retrieves ChatHandler from app.state.
    """
    chat_handler = cast(ChatHandler, request.app.state.chat_handler)
    if chat_handler is None:
        raise HTTPException(status_code=500, detail="ChatHandler not initialized in app.state")
    return chat_handler