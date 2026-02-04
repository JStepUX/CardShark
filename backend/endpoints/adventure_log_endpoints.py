"""
backend/endpoints/adventure_log_endpoints.py
REST API endpoints for Adventure Log and Room Summarization.

These endpoints handle room visit summaries for narrative continuity.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request

from backend.models.adventure_log import (
    SummarizeRoomRequest,
    SummarizeRoomResponse,
    AdventureContext,
    AdventureLogEntryComplete,
    RoomSummary,
    create_empty_room_summary
)
from backend.services.adventure_log_service import AdventureLogService
from backend.services.summarization_service import SummarizationService
from backend.log_manager import LogManager
from backend.api_handler import ApiHandler
from backend.database import get_db
from backend.response_models import (
    DataResponse,
    create_data_response,
    STANDARD_RESPONSES
)

router = APIRouter(
    prefix="/api/context",
    tags=["adventure-log"],
    responses=STANDARD_RESPONSES
)


def get_adventure_log_service(request: Request) -> AdventureLogService:
    """Get AdventureLogService instance."""
    from backend.log_manager import LogManager
    logger = request.app.state.logger
    return AdventureLogService(
        db_session_generator=get_db,
        logger=logger
    )


def get_summarization_service(request: Request) -> SummarizationService:
    """Get SummarizationService instance."""
    logger = request.app.state.logger
    api_handler = request.app.state.api_handler
    return SummarizationService(
        api_handler=api_handler,
        logger=logger
    )


@router.post(
    "/summarize-room",
    response_model=DataResponse,
    summary="Summarize a room visit",
    description="Generates a summary of a room visit using LLM or fallback extraction"
)
async def summarize_room(
    request: Request,
    data: SummarizeRoomRequest,
    log_service: AdventureLogService = Depends(get_adventure_log_service),
    summarization_service: SummarizationService = Depends(get_summarization_service),
):
    """
    Summarize a room visit and store in adventure log.

    This endpoint:
    1. Creates or updates an adventure log entry for the room visit
    2. Generates a summary using LLM (preferred) or keyword extraction (fallback)
    3. Stores the summary in the database for future context injection
    """
    logger: LogManager = request.app.state.logger

    try:
        logger.log_step(f"Summarizing room visit: {data.room_name} (world={data.world_uuid[:8]}...)")

        # Get API config from settings if available
        api_config = None
        try:
            settings_manager = request.app.state.settings_manager
            settings = settings_manager.get_settings()
            if settings.get('api_url'):
                api_config = {
                    'url': settings.get('api_url'),
                    'apiKey': settings.get('api_key'),
                    'provider': settings.get('provider', 'KoboldCPP'),
                    'generation_settings': settings.get('generation_settings', {})
                }
        except Exception as e:
            logger.log_warning(f"Could not load API config for summarization: {e}")

        # Generate summary
        summary, method = await summarization_service.summarize_room_messages(
            room_uuid=data.room_uuid,
            room_name=data.room_name,
            visited_at=data.visited_at,
            messages=data.messages,
            npcs=data.npcs,
            api_config=api_config
        )

        # Store in adventure log
        # First, try to find existing incomplete entry
        existing = log_service.get_latest_incomplete_entry(data.world_uuid, data.user_uuid)

        if existing and existing.room_uuid == data.room_uuid and existing.visited_at == data.visited_at:
            # Complete the existing entry
            complete_data = AdventureLogEntryComplete(
                departed_at=summary.departed_at,
                message_count=summary.message_count,
                summary=summary
            )
            log_service.complete_entry(
                world_uuid=data.world_uuid,
                user_uuid=data.user_uuid,
                room_uuid=data.room_uuid,
                visited_at=data.visited_at,
                complete_data=complete_data
            )
        else:
            # Create new entry and immediately complete it
            log_service.create_entry(
                world_uuid=data.world_uuid,
                user_uuid=data.user_uuid,
                room_uuid=data.room_uuid,
                room_name=data.room_name,
                visited_at=data.visited_at
            )
            complete_data = AdventureLogEntryComplete(
                departed_at=summary.departed_at,
                message_count=summary.message_count,
                summary=summary
            )
            log_service.complete_entry(
                world_uuid=data.world_uuid,
                user_uuid=data.user_uuid,
                room_uuid=data.room_uuid,
                visited_at=data.visited_at,
                complete_data=complete_data
            )

        response = SummarizeRoomResponse(
            summary=summary,
            method=method
        )

        return create_data_response(response.model_dump())

    except Exception as e:
        logger.log_error(f"Error summarizing room: {e}")
        # Return fallback summary instead of 500 error to prevent room transition failures
        fallback_summary = create_empty_room_summary(
            data.room_uuid, data.room_name, data.visited_at
        )
        fallback_summary = RoomSummary(
            **{**fallback_summary.model_dump(),
               'key_events': ['Visit recorded (summarization unavailable)']}
        )
        return create_data_response({
            "summary": fallback_summary.model_dump(),
            "method": "error_fallback"
        })


@router.get(
    "/adventure-log/{world_uuid}/{user_uuid}",
    response_model=DataResponse,
    summary="Get adventure context",
    description="Returns the adventure context for a world playthrough"
)
async def get_adventure_log(
    world_uuid: str,
    user_uuid: str,
    max_entries: int = 10,
    request: Request = None,
    log_service: AdventureLogService = Depends(get_adventure_log_service),
):
    """
    Get the adventure context for a world+user playthrough.

    Returns recent room summaries for injecting into LLM context.
    """
    logger: LogManager = request.app.state.logger

    try:
        logger.log_step(f"Fetching adventure context for world={world_uuid[:8]}..., user={user_uuid[:8]}...")

        context = log_service.get_adventure_context(
            world_uuid=world_uuid,
            user_uuid=user_uuid,
            max_entries=max_entries
        )

        return create_data_response(context.model_dump())

    except Exception as e:
        logger.log_error(f"Error fetching adventure log: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch adventure log: {str(e)}")


@router.post(
    "/adventure-log/{world_uuid}/{user_uuid}/entry",
    response_model=DataResponse,
    summary="Create adventure log entry",
    description="Creates a new adventure log entry when entering a room"
)
async def create_adventure_log_entry(
    world_uuid: str,
    user_uuid: str,
    room_uuid: str,
    room_name: str,
    visited_at: int,
    request: Request = None,
    log_service: AdventureLogService = Depends(get_adventure_log_service),
):
    """
    Create a new adventure log entry when entering a room.
    Called at the start of a room visit.
    """
    logger: LogManager = request.app.state.logger

    try:
        logger.log_step(f"Creating adventure log entry for room={room_name}")

        entry = log_service.create_entry(
            world_uuid=world_uuid,
            user_uuid=user_uuid,
            room_uuid=room_uuid,
            room_name=room_name,
            visited_at=visited_at
        )

        return create_data_response(entry.model_dump())

    except Exception as e:
        logger.log_error(f"Error creating adventure log entry: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create entry: {str(e)}")


@router.delete(
    "/adventure-log/{world_uuid}/{user_uuid}",
    response_model=DataResponse,
    summary="Delete adventure log entries",
    description="Deletes all adventure log entries for a world+user combination"
)
async def delete_adventure_log(
    world_uuid: str,
    user_uuid: str,
    request: Request = None,
    log_service: AdventureLogService = Depends(get_adventure_log_service),
):
    """
    Delete all adventure log entries for a world+user.
    Used when starting a new game or clearing progress.
    """
    logger: LogManager = request.app.state.logger

    try:
        logger.log_step(f"Deleting adventure log for world={world_uuid[:8]}..., user={user_uuid[:8]}...")

        count = log_service.delete_entries_for_world(world_uuid, user_uuid)

        return create_data_response({
            "deleted_count": count,
            "message": f"Deleted {count} adventure log entries"
        })

    except Exception as e:
        logger.log_error(f"Error deleting adventure log: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete adventure log: {str(e)}")
