"""
backend/endpoints/world_progress_endpoints.py
REST API endpoints for World User Progress management.

These endpoints handle per-user world playthrough progress (save slots).
Progress is keyed by (world_uuid, user_uuid) composite key.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from backend.models.world_progress import (
    WorldUserProgress,
    WorldUserProgressUpdate,
    WorldUserProgressSummary
)
from backend.services.world_progress_service import WorldUserProgressService
from backend.services.user_profile_service import UserProfileService
from backend.log_manager import LogManager
from backend.dependencies import (
    get_logger_dependency,
    get_world_progress_service_dependency,
    get_user_profile_service_dependency
)
from backend.response_models import (
    DataResponse,
    ListResponse,
    create_data_response,
    create_list_response,
    STANDARD_RESPONSES
)

router = APIRouter(
    prefix="/api/world",
    tags=["world-progress"],
    responses=STANDARD_RESPONSES
)


@router.get(
    "/{world_uuid}/progress/{user_uuid}",
    response_model=DataResponse,
    summary="Get world progress for a user",
    description="Returns the playthrough progress for a given world+user combination"
)
async def get_world_progress(
    world_uuid: str,
    user_uuid: str,
    service: WorldUserProgressService = Depends(get_world_progress_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Get progress for a world+user combination. Returns 404 if no progress exists (fresh start)."""
    try:
        logger.log_step(f"Fetching progress for world={world_uuid}, user={user_uuid}")

        progress = service.get_progress(world_uuid, user_uuid)

        if not progress:
            raise HTTPException(
                status_code=404,
                detail="No progress found for this world+user combination (fresh start)"
            )

        return create_data_response(progress.model_dump())

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error fetching world progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch progress: {str(e)}")


@router.put(
    "/{world_uuid}/progress/{user_uuid}",
    response_model=DataResponse,
    summary="Save world progress for a user",
    description="Upserts playthrough progress for a given world+user combination"
)
async def save_world_progress(
    world_uuid: str,
    user_uuid: str,
    update: WorldUserProgressUpdate,
    service: WorldUserProgressService = Depends(get_world_progress_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Save (upsert) progress for a world+user combination."""
    try:
        logger.log_step(f"Saving progress for world={world_uuid}, user={user_uuid}")

        progress = service.save_progress(world_uuid, user_uuid, update)

        return create_data_response({
            "progress": progress.model_dump(),
            "message": "Progress saved successfully"
        })

    except Exception as e:
        logger.log_error(f"Error saving world progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save progress: {str(e)}")


@router.get(
    "/{world_uuid}/progress-summary",
    response_model=ListResponse,
    summary="List all users who have played this world",
    description="Returns a summary of all users who have progress for this world (save slot display)"
)
async def list_world_progress_summary(
    world_uuid: str,
    service: WorldUserProgressService = Depends(get_world_progress_service_dependency),
    user_service: UserProfileService = Depends(get_user_profile_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """List all progress records for a world with user names resolved."""
    try:
        logger.log_step(f"Listing progress summary for world={world_uuid}")

        summaries = service.list_progress_for_world(world_uuid)

        # Resolve user names from user profiles
        for summary in summaries:
            try:
                user_profile = user_service.get_user_by_uuid(summary.user_uuid)
                if user_profile:
                    summary.user_name = user_profile.name
            except Exception as e:
                logger.log_warning(f"Could not resolve user name for {summary.user_uuid}: {e}")

        return create_list_response(
            data=[s.model_dump() for s in summaries],
            total=len(summaries)
        )

    except Exception as e:
        logger.log_error(f"Error listing world progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list progress: {str(e)}")


@router.delete(
    "/{world_uuid}/progress/{user_uuid}",
    response_model=DataResponse,
    summary="Delete world progress for a user",
    description="Deletes playthrough progress for a given world+user combination"
)
async def delete_world_progress(
    world_uuid: str,
    user_uuid: str,
    service: WorldUserProgressService = Depends(get_world_progress_service_dependency),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete progress for a world+user combination."""
    try:
        logger.log_step(f"Deleting progress for world={world_uuid}, user={user_uuid}")

        success = service.delete_progress(world_uuid, user_uuid)

        if not success:
            raise HTTPException(
                status_code=404,
                detail="No progress found for this world+user combination"
            )

        return create_data_response({
            "success": True,
            "message": "Progress deleted successfully"
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.log_error(f"Error deleting world progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete progress: {str(e)}")
