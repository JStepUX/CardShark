"""
backend/endpoints/world_card_endpoints_v2.py
REST API endpoints for World Card PNG management (V2).

These endpoints handle world cards as PNG files with embedded metadata.
Replaces the old world_state.json system.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import ValidationError

from backend.models.world_card import (
    WorldCard, WorldCardSummary, CreateWorldRequest, ConvertWorldRequest, UpdateWorldRequest,
    WorldDeletePreview
)
from backend.models.world_state import GridSize
from backend.services.world_card_service import WorldCardService
from backend.handlers.room_card_handler import RoomCardHandler
from backend.services.world_export_service import WorldExportService
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
    prefix="/api/world-cards-v2",
    tags=["world-cards-v2"],
    responses=STANDARD_RESPONSES
)


def get_world_card_handler(
    character_service: CharacterService = Depends(get_character_service_dependency),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
) -> WorldCardService:
    """Dependency injection for WorldCardService"""
    return WorldCardService(character_service, png_handler, settings_manager, logger)


def get_room_card_handler(
    character_service: CharacterService = Depends(get_character_service_dependency),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    settings_manager: SettingsManager = Depends(get_settings_manager_dependency),
    logger: LogManager = Depends(get_logger_dependency)
) -> RoomCardHandler:
    """Dependency injection for RoomCardHandler"""
    return RoomCardHandler(character_service, png_handler, settings_manager, logger)


def get_export_handler(
    world_handler: WorldCardService = Depends(get_world_card_handler),
    room_handler: RoomCardHandler = Depends(get_room_card_handler),
    character_service: CharacterService = Depends(get_character_service_dependency),
    png_handler: PngMetadataHandler = Depends(get_png_handler_dependency),
    logger: LogManager = Depends(get_logger_dependency)
) -> WorldExportService:
    """Dependency injection for WorldExportService"""
    return WorldExportService(world_handler, room_handler, character_service, png_handler, logger)


@router.post(
    "/",
    response_model=DataResponse,
    summary="Create a new world card",
    description="Creates a new world card PNG file with embedded metadata"
)
async def create_world_card(
    name: str = Form(..., description="World name"),
    description: str = Form("", description="World description"),
    grid_width: int = Form(10, description="Grid width"),
    grid_height: int = Form(10, description="Grid height"),
    first_mes: str = Form(None, description="World introduction text"),
    system_prompt: str = Form(None, description="World atmosphere/system prompt"),
    image: UploadFile = File(None, description="Optional world image (uses default if not provided)"),
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Create a new world card PNG file"""
    try:
        logger.log_step(f"Creating world card: {name}")

        # Read image bytes if provided
        image_bytes = None
        if image and image.file:
            image_bytes = await image.read()
            if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                raise HTTPException(status_code=400, detail="Invalid image: not a PNG")

        # Create request model
        request = CreateWorldRequest(
            name=name,
            description=description,
            grid_size=GridSize(width=grid_width, height=grid_height),
            first_mes=first_mes if first_mes else None,
            system_prompt=system_prompt if system_prompt else None
        )

        # Create world card
        world_summary = handler.create_world_card(request, image_bytes)

        return create_data_response({
            "world": world_summary.model_dump(),
            "message": f"World '{name}' created successfully"
        })

    except ValidationError as e:
        logger.log_error(f"Validation error creating world: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.log_error(f"Error creating world card: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create world: {str(e)}")


@router.post(
    "/convert",
    response_model=DataResponse,
    summary="Convert a character to a world",
    description="Creates a new world card from an existing character card"
)
async def convert_character_to_world(
    request: ConvertWorldRequest,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Convert character to world"""
    try:
        logger.log_step(f"Converting character {request.character_path} to world '{request.name}'")
        
        world_summary = handler.convert_character_to_world(request)
        
        if not world_summary:
            raise HTTPException(status_code=404, detail="Source character not found or failed to load")
            
        return create_data_response({
            "character_uuid": world_summary.uuid,
            "world": world_summary.model_dump(),
            "message": f"World '{request.name}' converted successfully"
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error converting world: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to convert world: {str(e)}")


@router.get(
    "/",
    response_model=ListResponse,
    summary="List all world cards",
    description="Returns a list of all world card PNG files"
)
async def list_world_cards(
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List all world cards"""
    try:
        logger.log_step("Listing world cards")
        world_cards = handler.list_world_cards()

        return create_list_response(
            data=[w.model_dump() for w in world_cards],
            total=len(world_cards)
        )

    except Exception as e:
        logger.log_error(f"Error listing world cards: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list worlds: {str(e)}")


@router.get(
    "/{world_uuid}",
    response_model=DataResponse,
    summary="Get a single world card",
    description="Returns the complete world card data for a given UUID"
)
async def get_world_card(
    world_uuid: str,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get a single world card by UUID"""
    try:
        logger.log_step(f"Fetching world card: {world_uuid}")
        world_card = handler.get_world_card(world_uuid)

        if not world_card:
            raise HTTPException(status_code=404, detail=f"World card {world_uuid} not found")

        return create_data_response({
            "world": world_card.model_dump()
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error fetching world card {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch world: {str(e)}")


@router.put(
    "/{world_uuid}",
    response_model=DataResponse,
    summary="Update a world card",
    description="Updates an existing world card PNG file"
)
async def update_world_card(
    world_uuid: str,
    request: UpdateWorldRequest,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Update an existing world card"""
    try:
        logger.log_step(f"Updating world card: {world_uuid}")

        world_summary = handler.update_world_card(world_uuid, request)

        if not world_summary:
            raise HTTPException(status_code=404, detail=f"World card {world_uuid} not found")

        return create_data_response({
            "world": world_summary.model_dump(),
            "message": f"World '{world_summary.name}' updated successfully"
        })

    except HTTPException:
        raise
    except ValidationError as e:
        logger.log_error(f"Validation error updating world: {e}")
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.log_error(f"Error updating world card {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update world: {str(e)}")


@router.get(
    "/{world_uuid}/delete-preview",
    response_model=DataResponse,
    summary="Preview world deletion",
    description="Get a preview of what rooms will be deleted/kept when this world is deleted"
)
async def get_delete_preview(
    world_uuid: str,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get a preview of what will happen when deleting a world"""
    try:
        logger.log_step(f"Getting delete preview for world: {world_uuid}")

        preview = handler.get_delete_preview(world_uuid)

        if not preview:
            raise HTTPException(status_code=404, detail=f"World card {world_uuid} not found")

        return create_data_response({
            "preview": preview.model_dump()
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error getting delete preview for {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get delete preview: {str(e)}")


@router.delete(
    "/{world_uuid}",
    response_model=DataResponse,
    summary="Delete a world card",
    description="Deletes a world card PNG file. Use delete_rooms=true to also delete auto-generated rooms."
)
async def delete_world_card(
    world_uuid: str,
    delete_rooms: bool = False,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a world card with optional cascade deletion of auto-generated rooms"""
    try:
        logger.log_step(f"Deleting world card: {world_uuid} (delete_rooms={delete_rooms})")

        if delete_rooms:
            # Use smart delete with room cascade
            result = handler.delete_world_card_with_rooms(world_uuid, delete_generated_rooms=True)

            if not result["success"]:
                raise HTTPException(status_code=404, detail=f"World card {world_uuid} not found")

            return create_data_response({
                "success": True,
                "world_deleted": result["world_deleted"],
                "rooms_deleted": len(result["rooms_deleted"]),
                "rooms_kept": len(result["rooms_kept"]),
                "message": f"World deleted successfully. {len(result['rooms_deleted'])} auto-generated room(s) also deleted."
            })
        else:
            # Simple delete without room cascade
            success = handler.delete_world_card(world_uuid)

            if not success:
                raise HTTPException(status_code=404, detail=f"World card {world_uuid} not found")

            return create_data_response({
                "success": True,
                "world_deleted": True,
                "rooms_deleted": 0,
                "rooms_kept": 0,
                "message": "World deleted successfully"
            })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting world card {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete world: {str(e)}")


@router.get(
    "/{world_uuid}/image",
    summary="Get world card image",
    description="Serves the world card PNG image file"
)
async def get_world_card_image(
    world_uuid: str,
    handler: WorldCardService = Depends(get_world_card_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serve the world card PNG image"""
    try:
        # Use character service to get the PNG path
        with handler.character_service._get_session_context() as db:
            character = handler.character_service.get_character_by_uuid(world_uuid, db)

            if not character or not character.png_file_path:
                raise HTTPException(status_code=404, detail="World card image not found")

            return FileResponse(character.png_file_path, media_type="image/png")

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error serving world image {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to serve world image: {str(e)}")


@router.get(
    "/{world_uuid}/export",
    summary="Export world as ZIP archive",
    description="Exports world card with all rooms and characters as .cardshark.zip"
)
async def export_world_card(
    world_uuid: str,
    handler: WorldExportService = Depends(get_export_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Export world and all dependencies as ZIP archive"""
    try:
        logger.log_step(f"Exporting world card: {world_uuid}")

        zip_bytes, filename = handler.export_world(world_uuid)

        from fastapi.responses import Response

        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error exporting world {world_uuid}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export world: {str(e)}")


@router.post(
    "/import",
    response_model=DataResponse,
    summary="Import world from ZIP archive",
    description="Imports a .cardshark.zip archive with UUID regeneration"
)
async def import_world_card(
    file: UploadFile = File(..., description="World archive (.cardshark.zip)"),
    handler: WorldExportService = Depends(get_export_handler),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Import world and all dependencies from ZIP archive"""
    try:
        logger.log_step(f"Importing world from file: {file.filename}")

        # Validate file extension
        if not file.filename or not file.filename.endswith('.cardshark.zip'):
            raise HTTPException(status_code=400, detail="Invalid file: must be a .cardshark.zip archive")

        # Read ZIP file
        zip_bytes = await file.read()

        # Import world
        new_world_uuid = handler.import_world(zip_bytes)

        # Get the imported world card for response
        world_card = handler.world_handler.get_world_card(new_world_uuid)
        if not world_card:
            raise HTTPException(status_code=500, detail="World imported but could not be retrieved")

        return create_data_response({
            "world": {
                "uuid": new_world_uuid,
                "name": world_card.data.name,
                "description": world_card.data.description
            },
            "message": f"World '{world_card.data.name}' imported successfully"
        })

    except HTTPException:
        raise
    except ValueError as e:
        logger.log_error(f"Import validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.log_error(f"Error importing world: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import world: {str(e)}")
