"""
backend/endpoints/room_card_endpoints.py
REST API endpoints for Room Card PNG management.

These endpoints handle room cards as PNG files with embedded metadata.
Separate from database-backed room endpoints in room_endpoints.py.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import ValidationError

from backend.models.room_card import (
    RoomCard, RoomCardSummary, CreateRoomRequest, UpdateRoomRequest
)
from backend.handlers.room_card_handler import RoomCardHandler
from backend.services.character_service import CharacterService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager
from backend.dependencies import (
    get_logger_dependency,
    get_character_service_dependency,
    get_png_handler_dependency,
    get_settings_manager_dependency
)
from backend.response_models import (
    DataResponse,
    ListResponse,
    create_data_response,
    create_list_response,
    STANDARD_RESPONSES
)

router = APIRouter(
    prefix="/api/room-cards",
    tags=["room-cards"],
    responses=STANDARD_RESPONSES
)


def get_room_card_handler(
    character_service: CharacterService = Depends(get_character_service_dependency),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
) -> RoomCardHandler:
    """Dependency injection for RoomCardHandler"""
    return RoomCardHandler(character_service, png_handler, settings_manager, logger)


@router.post(
    "/",
    response_model=DataResponse,
    summary="Create a new room card",
    description="Creates a new room card PNG file with embedded metadata"
)
async def create_room_card(
    name: str = Form(..., description="Room name"),
    description: str = Form("", description="Room description"),
    first_mes: str = Form(None, description="Introduction text when entering room"),
    system_prompt: str = Form(None, description="Room atmosphere/system prompt"),
    image: UploadFile = File(None, description="Optional room image (uses default if not provided)"),
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Create a new room card PNG file"""
    try:
        logger.log_step(f"Creating room card: {name}")

        # Read image bytes if provided
        image_bytes = None
        if image and image.file:
            image_bytes = await image.read()
            if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(status_code=400, detail="Invalid image: not a PNG")

        # Create request model
        request = CreateRoomRequest(
            name=name,
            description=description,
            first_mes=first_mes if first_mes else None,
            system_prompt=system_prompt if system_prompt else None
        )

        # Create room card
        room_summary = handler.create_room_card(request, image_bytes)

        return create_data_response({
            "room": room_summary.model_dump(),
            "message": f"Room '{name}' created successfully"
        })

    except ValidationError as e:
        logger.log_error(f"Validation error creating room: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.log_error(f"Error creating room card: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create room: {str(e)}")


@router.get(
    "/",
    response_model=ListResponse,
    summary="List all room cards",
    description="Returns a list of all room card PNG files"
)
async def list_room_cards(
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List all room cards"""
    try:
        logger.log_step("Listing room cards")
        room_cards = handler.list_room_cards()

        return create_list_response(
            data=[r.model_dump() for r in room_cards],
            total=len(room_cards)
        )

    except Exception as e:
        logger.log_error(f"Error listing room cards: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list rooms: {str(e)}")


@router.get(
    "/{room_uuid}",
    response_model=DataResponse,
    summary="Get a single room card",
    description="Returns the complete room card data for a given UUID"
)
async def get_room_card(
    room_uuid: str,
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get a single room card by UUID"""
    try:
        logger.log_step(f"Fetching room card: {room_uuid}")
        room_card = handler.get_room_card(room_uuid)

        if not room_card:
            raise HTTPException(status_code=404, detail=f"Room card {room_uuid} not found")

        return create_data_response({
            "room": room_card.model_dump()
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error fetching room card {room_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch room: {str(e)}")


@router.put(
    "/{room_uuid}",
    response_model=DataResponse,
    summary="Update a room card",
    description="Updates an existing room card PNG file"
)
async def update_room_card(
    room_uuid: str,
    request: UpdateRoomRequest,
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update an existing room card"""
    try:
        logger.log_step(f"Updating room card: {room_uuid}")

        room_summary = handler.update_room_card(room_uuid, request)

        if not room_summary:
            raise HTTPException(status_code=404, detail=f"Room card {room_uuid} not found")

        return create_data_response({
            "room": room_summary.model_dump(),
            "message": f"Room '{room_summary.name}' updated successfully"
        })

    except HTTPException:
        raise
    except ValidationError as e:
        logger.log_error(f"Validation error updating room: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.log_error(f"Error updating room card {room_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update room: {str(e)}")


@router.delete(
    "/{room_uuid}",
    response_model=DataResponse,
    summary="Delete a room card",
    description="Deletes a room card PNG file"
)
async def delete_room_card(
    room_uuid: str,
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a room card"""
    try:
        logger.log_step(f"Deleting room card: {room_uuid}")

        success = handler.delete_room_card(room_uuid)

        if not success:
            raise HTTPException(status_code=404, detail=f"Room card {room_uuid} not found")

        return create_data_response({
            "success": True,
            "message": "Room deleted successfully"
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting room card {room_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete room: {str(e)}")


@router.get(
    "/{room_uuid}/image",
    summary="Get room card image",
    description="Serves the room card PNG image file"
)
async def get_room_card_image(
    room_uuid: str,
    handler: RoomCardHandler = Depends(get_room_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serve the room card PNG image"""
    try:
        # Use character service to get the PNG path
        with handler.character_service.db_session_generator() as db:
            character = handler.character_service.get_character_by_uuid(room_uuid, db)

            if not character or not character.png_file_path:
                raise HTTPException(status_code=404, detail="Room card image not found")

            return FileResponse(character.png_file_path, media_type="image/png")

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving room image {room_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to serve room image: {str(e)}")
