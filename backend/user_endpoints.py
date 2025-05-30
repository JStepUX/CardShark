# backend/user_endpoints.py
# Implements API endpoints for user profile operations with standardized FastAPI patterns
import os
import traceback
import uuid
from datetime import datetime
from pathlib import Path
import logging

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse

# Import handler type for type hinting
from backend.log_manager import LogManager

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
    ValidationException,
    NotFoundException,
    handle_generic_error
)
from backend.dependencies import get_logger_dependency

# Create router
router = APIRouter(
    prefix="/api",
    tags=["users"],
    responses=STANDARD_RESPONSES
)

# --- User Profile Endpoints ---

USERS_DIR = Path("users")

@router.get("/users", response_model=ListResponse[dict])
async def list_users(logger: LogManager = Depends(get_logger_dependency)):
    """List user profile filenames (PNG) in the users directory."""
    try:
        # Create users directory if it doesn't exist
        if not USERS_DIR.exists():
            USERS_DIR.mkdir(parents=True, exist_ok=True)
            logger.log_step(f"Created users directory: {USERS_DIR}")

        user_files = []
        for file in USERS_DIR.glob("*.png"):
            # Only include PNG files
            if file.suffix.lower() == ".png":
                try:
                     stat_result = file.stat()
                     user_files.append({
                         "name": file.stem,
                         "filename": file.name,
                         "modified": stat_result.st_mtime
                     })
                except OSError as stat_error:
                     logger.log_warning(f"Could not stat file {file.name}: {stat_error}")
                     # Optionally skip the file or add with null modified time

        # Sort by filename (case-insensitive)
        user_files.sort(key=lambda x: x["name"].lower())

        logger.log_step(f"Found {len(user_files)} user profiles")
        return ListResponse(
            success=True,
            message="User profiles retrieved successfully",
            data=user_files,
            count=len(user_files)
        )

    except Exception as e:
        logger.log_error(f"Error listing users: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to list users")

@router.get("/user-image/{filename}")
async def get_user_image(
    filename: str, 
    logger: LogManager = Depends(get_logger_dependency)
):
    """Serve a user profile image file."""
    try:
        # Security check: prevent directory traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            logger.log_warning(f"Suspicious user image filename requested: {filename}")
            raise ValidationException("Invalid filename")

        file_path = USERS_DIR / filename
        logger.log_step(f"Attempting to serve user image: {file_path}")

        if not file_path.is_file(): # Check if it's a file and exists
            logger.log_warning(f"User image not found: {file_path}")
            raise NotFoundException("User image not found")

        # Basic check for image type based on extension
        if file_path.suffix.lower() != ".png":
             logger.warning(f"Requested user file is not a PNG: {filename}")
             raise ValidationException("Invalid file type, only PNG supported")

        return FileResponse(file_path, media_type="image/png")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error serving user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to serve user image")

@router.post("/user-image/create", response_model=DataResponse[dict])
async def create_user_image(
    file: UploadFile = File(...),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload a new user profile PNG image."""
    try:
        # Create users directory if it doesn't exist
        if not USERS_DIR.exists():
            USERS_DIR.mkdir(parents=True, exist_ok=True)
            logger.log_step(f"Created users directory: {USERS_DIR}")

        # Check file content type
        content_type = file.content_type
        if not content_type or content_type != "image/png":
            logger.log_warning(f"Invalid file type for user image: {content_type}")
            raise ValidationException("Only PNG image files are allowed")

        # Generate a filename based on original name (sanitized)
        orig_filename = file.filename or "user.png"
        orig_name = Path(orig_filename).stem

        # Ensure the filename is safe
        safe_name = ''.join(c for c in orig_name if c.isalnum() or c in ['_', '-']) # Allow underscore/hyphen
        if not safe_name:
            safe_name = "user" # Fallback if name becomes empty after sanitization
        safe_name = safe_name[:50] # Limit length

        new_filename = f"{safe_name}.png"
        file_path = USERS_DIR / new_filename

        # Handle potential filename conflicts by adding a timestamp
        counter = 0
        while file_path.exists():
             counter += 1
             timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
             new_filename = f"{safe_name}_{timestamp}_{counter}.png"
             file_path = USERS_DIR / new_filename
             if counter > 10: # Prevent infinite loop in unlikely scenario
                  logger.error("Could not generate unique filename after multiple attempts.")
                  raise ValidationException("Failed to generate unique filename")

        # Save the file
        try:
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            logger.log_step(f"User image saved: {file_path}")
        except IOError as write_error:
             logger.error(f"Failed to write user image file {file_path}: {write_error}")
             raise ValidationException("Failed to save user image file")

        return create_data_response({
            "filename": new_filename,
            "path": str(file_path) # Return server-side path for reference
        }, "User image created successfully")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error creating user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to create user image")

@router.delete("/user/{filename}", response_model=DataResponse[dict])
async def delete_user_image(
    filename: str, 
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a user profile image file (sends to trash if possible)."""
    try:
        # Security check: prevent directory traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            logger.log_warning(f"Suspicious user image filename requested for deletion: {filename}")
            raise ValidationException("Invalid filename")

        file_path = USERS_DIR / filename
        logger.log_step(f"Request to delete user image: {file_path}")

        if not file_path.is_file(): # Check if it's a file and exists
            logger.log_warning(f"User image not found for deletion: {file_path}")
            raise NotFoundException(f"User image not found: {filename}")

        # Attempt to send to trash first
        try:
            import send2trash
            send2trash.send2trash(str(file_path))
            logger.log_step(f"User image sent to trash: {file_path}")
        except ImportError:
             logger.warning("send2trash module not found. Falling back to direct deletion.")
             os.remove(file_path)
             logger.log_step(f"User image deleted directly: {file_path}")
        except Exception as trash_error:
             logger.error(f"Error sending user image to trash: {trash_error}. Falling back to direct deletion.")
             os.remove(file_path)
             logger.log_step(f"User image deleted directly after trash error: {file_path}")

        return create_data_response({
            "filename": filename
        }, f"User image '{filename}' deleted successfully")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to delete user image")