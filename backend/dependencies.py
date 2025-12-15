# backend/dependencies.py
# Centralized dependency injection for FastAPI endpoints following best practices

from sqlalchemy.orm import Session
from fastapi import Depends, Request, HTTPException
from typing import cast, Optional

# Core dependencies
from .database import get_db
from .log_manager import LogManager
from .settings_manager import SettingsManager
from .png_metadata_handler import PngMetadataHandler

# Service dependencies
from .services.character_service import CharacterService
from .services.character_sync_service import CharacterSyncService
from .services.character_sync_service import CharacterSyncService
from .services.reliable_chat_manager_db import DatabaseReliableChatManager
from .services.database_chat_endpoint_adapters import DatabaseChatEndpointAdapters

# Handler dependencies
from .template_handler import TemplateHandler
from .background_handler import BackgroundHandler
from .content_filter_manager import ContentFilterManager
from .lore_handler import LoreHandler
from .backyard_handler import BackyardHandler
from .handlers.world_state_handler import WorldStateHandler
from .handlers.world_card_chat_handler import WorldCardChatHandler
from .world_asset_handler import WorldAssetHandler
from .world_card_handler import WorldCardHandler

# Core dependency providers
def get_logger(request: Request) -> LogManager:
    """Get LogManager instance from app state."""
    logger = cast(LogManager, request.app.state.logger)
    if logger is None:
        raise HTTPException(status_code=500, detail="Logger not initialized")
    return logger

def get_settings_manager(request: Request) -> SettingsManager:
    """Get SettingsManager instance from app state."""
    settings_manager = cast(SettingsManager, request.app.state.settings_manager)
    if settings_manager is None:
        raise HTTPException(status_code=500, detail="Settings manager not initialized")
    return settings_manager

def get_png_handler(request: Request) -> PngMetadataHandler:
    """Get PngMetadataHandler instance from app state."""
    png_handler = cast(PngMetadataHandler, request.app.state.png_handler)
    if png_handler is None:
        raise HTTPException(status_code=500, detail="PNG handler not initialized")
    return png_handler

# Service dependency providers
def get_character_service_dependency(request: Request) -> CharacterService:
    """
    FastAPI dependency to get an instance of CharacterService.
    Retrieves required dependencies from app.state.
    """
    png_handler = get_png_handler(request)
    settings_manager = get_settings_manager(request)
    logger = get_logger(request)

    return CharacterService(
        db_session_generator=get_db,
        png_handler=png_handler,
        settings_manager=settings_manager,
        logger=logger
    )

def get_character_sync_service_dependency(request: Request) -> CharacterSyncService:
    """
    FastAPI dependency to get an instance of CharacterSyncService.
    Retrieves required dependencies from app.state.
    """
    character_sync_service = cast(CharacterSyncService, request.app.state.character_sync_service)
    if character_sync_service is None:
        raise HTTPException(status_code=500, detail="Character sync service not initialized")
    return character_sync_service

def get_database_chat_manager(request: Request, db: Session = Depends(get_db)) -> DatabaseReliableChatManager:
    """
    FastAPI dependency to get an instance of DatabaseReliableChatManager.
    This is the new database-only implementation without file dependencies.
    """
    logger = get_logger(request)
    
    return DatabaseReliableChatManager(
        db_session=db,
        logger=logger
    )

def get_database_chat_endpoint_adapters(request: Request, db: Session = Depends(get_db)) -> DatabaseChatEndpointAdapters:
    """
    FastAPI dependency to get an instance of DatabaseChatEndpointAdapters.
    Provides endpoint-compatible methods for the database-only chat system.
    """
    database_chat_manager = get_database_chat_manager(request, db)
    
    return DatabaseChatEndpointAdapters(database_chat_manager)

# Handler dependency providers
def get_template_handler(request: Request) -> TemplateHandler:
    """Get TemplateHandler instance from app state."""
    template_handler = cast(TemplateHandler, request.app.state.template_handler)
    if template_handler is None:
        raise HTTPException(status_code=500, detail="Template handler not initialized")
    return template_handler

def get_background_handler(request: Request) -> BackgroundHandler:
    """Get BackgroundHandler instance from app state."""
    background_handler = cast(BackgroundHandler, request.app.state.background_handler)
    if background_handler is None:
        raise HTTPException(status_code=500, detail="Background handler not initialized")
    return background_handler

def get_content_filter_manager(request: Request) -> ContentFilterManager:
    """Get ContentFilterManager instance from app state."""
    content_filter_manager = cast(ContentFilterManager, request.app.state.content_filter_manager)
    if content_filter_manager is None:
        raise HTTPException(status_code=500, detail="Content filter manager not initialized")
    return content_filter_manager

def get_lore_handler(request: Request) -> LoreHandler:
    """Get LoreHandler instance from app state."""
    lore_handler = cast(LoreHandler, request.app.state.lore_handler)
    if lore_handler is None:
        raise HTTPException(status_code=500, detail="Lore handler not initialized")
    return lore_handler

def get_world_state_handler(request: Request) -> WorldStateHandler:
    """Get WorldStateHandler instance from app state."""
    world_state_handler = cast(WorldStateHandler, request.app.state.world_state_handler)
    if world_state_handler is None:
        raise HTTPException(status_code=500, detail="World state handler not initialized")
    return world_state_handler

def get_world_card_chat_handler(request: Request) -> WorldCardChatHandler:
    """Get WorldCardChatHandler instance from app state."""
    world_card_chat_handler = cast(WorldCardChatHandler, request.app.state.world_card_chat_handler)
    if world_card_chat_handler is None:
        raise HTTPException(status_code=500, detail="World card chat handler not initialized")
    return world_card_chat_handler

def get_backyard_handler(request: Request) -> BackyardHandler:
    """Get BackyardHandler instance from app state."""
    backyard_handler = cast(BackyardHandler, request.app.state.backyard_handler)
    if backyard_handler is None:
        raise HTTPException(status_code=500, detail="Backyard handler not initialized")
    return backyard_handler

def get_world_card_handler(request: Request) -> WorldCardHandler:
    """Get WorldCardHandler instance from app state."""
    world_card_handler = cast(WorldCardHandler, request.app.state.world_card_handler)
    if world_card_handler is None:
        raise HTTPException(status_code=500, detail="World card handler not initialized")
    return world_card_handler

def get_character_service(request: Request, db: Session = Depends(get_db)) -> CharacterService:
    """Get CharacterService instance from app state."""
    character_service = cast(CharacterService, request.app.state.character_service)
    if character_service is None:
        raise HTTPException(status_code=500, detail="Character service not initialized")
    return character_service

# Database dependency (re-exported for convenience)
def get_database_session() -> Session:
    """Get database session (alias for get_db)."""
    return get_db()

# Optional: Dependency for pagination parameters
def get_pagination_params(
    page: int = 1,
    page_size: int = 20,
    max_page_size: int = 100
) -> dict:
    """Get standardized pagination parameters."""
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > max_page_size:
        page_size = max_page_size
    
    skip = (page - 1) * page_size
    return {
        "page": page,
        "page_size": page_size,
        "skip": skip,
        "limit": page_size
    }

# Dependency for request context (useful for logging and error handling)
def get_request_context(request: Request) -> dict:
    """Get request context information for logging and error handling."""
    return {
        "method": request.method,
        "url": str(request.url),
        "client_ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "request_id": request.headers.get("x-request-id", "unknown")
    }

# Standardized dependency functions with consistent naming convention
# These can be used directly in endpoint signatures for clarity

def get_db_dependency(db: Session = Depends(get_db)) -> Session:
    """FastAPI dependency to get a database session."""
    return db

def get_logger_dependency(request: Request) -> LogManager:
    """Get LogManager instance from app state (standardized dependency)."""
    return get_logger(request)

def get_settings_manager_dependency(request: Request) -> SettingsManager:
    """Get SettingsManager instance from app state (standardized dependency)."""
    return get_settings_manager(request)

def get_template_handler_dependency(request: Request) -> TemplateHandler:
    """Get TemplateHandler instance from app state (standardized dependency)."""
    return get_template_handler(request)

def get_background_handler_dependency(request: Request) -> BackgroundHandler:
    """Get BackgroundHandler instance from app state (standardized dependency)."""
    return get_background_handler(request)

def get_png_handler_dependency(request: Request) -> PngMetadataHandler:
    """Get PngMetadataHandler instance from app state (standardized dependency)."""
    return get_png_handler(request)

def get_backyard_handler_dependency(request: Request) -> BackyardHandler:
    """Get BackyardHandler instance from app state (standardized dependency)."""
    return get_backyard_handler(request)

def get_content_filter_manager_dependency(request: Request) -> ContentFilterManager:
    """Get ContentFilterManager instance from app state (standardized dependency)."""
    return get_content_filter_manager(request)

def get_lore_handler_dependency(request: Request) -> LoreHandler:
    """Get LoreHandler instance from app state (standardized dependency)."""
    return get_lore_handler(request)

def get_world_state_handler_dependency(request: Request) -> WorldStateHandler:
    """Get WorldStateHandler instance from app state (standardized dependency)."""
    return get_world_state_handler(request)

def get_world_asset_handler_dependency(request: Request) -> WorldAssetHandler:
    """Get WorldAssetHandler instance from app state (standardized dependency)."""
    return get_world_asset_handler(request)

def get_world_card_handler_dependency(request: Request) -> WorldCardHandler:
    """Get WorldCardHandler instance from app state (standardized dependency)."""
    return get_world_card_handler(request)