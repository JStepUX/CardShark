# backend/user_endpoints.py
# Implements API endpoints for user profile operations with standardized FastAPI patterns
import os
import traceback
import uuid
import json
import base64
from datetime import datetime
from pathlib import Path
import logging

from fastapi import APIRouter, Depends, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from PIL import Image, PngImagePlugin
from io import BytesIO

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
from backend.utils.path_utils import get_application_base_path, ensure_directory_exists

# Create router
router = APIRouter(
    prefix="/api",
    tags=["users"],
    responses=STANDARD_RESPONSES
)

# --- User Profile Endpoints ---

def _get_users_dir() -> Path:
    """Get the users directory path, ensuring it exists."""
    base_path = get_application_base_path()
    users_dir = base_path / "users"
    ensure_directory_exists(users_dir)
    return users_dir

USERS_DIR = Path("users")  # Fallback for legacy code


def _read_user_metadata_from_png(file_path: Path) -> dict:
    """Read user metadata from PNG file's 'chara' text chunk."""
    try:
        with Image.open(file_path) as img:
            if 'chara' in img.info:
                encoded_data = img.info['chara']
                if isinstance(encoded_data, bytes):
                    encoded_data = encoded_data.decode('utf-8', errors='ignore')
                # Handle padding
                padding_needed = len(encoded_data) % 4
                if padding_needed:
                    encoded_data += '=' * (4 - padding_needed)
                decoded_bytes = base64.b64decode(encoded_data)
                return json.loads(decoded_bytes.decode('utf-8'))
    except Exception:
        pass
    return {}


def _write_user_metadata_to_png(image_data: bytes, metadata: dict) -> bytes:
    """Write user metadata to PNG file's 'chara' text chunk."""
    # Encode metadata as base64 JSON (same format as character cards)
    json_str = json.dumps(metadata)
    base64_str = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
    
    # Prepare PNG info
    png_info = PngImagePlugin.PngInfo()
    
    with Image.open(BytesIO(image_data)) as img:
        # Preserve existing metadata (except character data)
        for key, value in img.info.items():
            if key not in ['chara', 'ccv3', 'exif']:
                try:
                    if isinstance(value, (str, bytes)):
                        png_info.add_text(key, value if isinstance(value, str) else value.decode('utf-8', errors='ignore'))
                except Exception:
                    pass
        
        # Add user metadata
        png_info.add_text('chara', base64_str)
        
        # Save image with metadata
        output = BytesIO()
        img.save(output, format="PNG", pnginfo=png_info, optimize=False)
        return output.getvalue()

@router.get("/users", response_model=ListResponse[dict])
async def list_users(request: Request, logger: LogManager = Depends(get_logger_dependency)):
    """List user profile filenames (PNG) in the users directory.
    
    Uses database index if available, falls back to file system scan.
    """
    try:
        # Try to use the user profile service from app state (database-backed)
        user_profile_service = getattr(request.app.state, 'user_profile_service', None)
        
        if user_profile_service:
            # Database-backed listing
            db_users = user_profile_service.get_all_users()
            user_files = []
            for user in db_users:
                user_files.append({
                    "user_uuid": user.user_uuid,
                    "name": user.name,
                    "filename": Path(user.png_file_path).name if user.png_file_path else None,
                    "description": user.description or "",
                    "modified": user.file_last_modified
                })
            
            # Sort by name (case-insensitive)
            user_files.sort(key=lambda x: x["name"].lower())
            
            logger.log_step(f"Found {len(user_files)} user profiles (from database)")
            return ListResponse(
                success=True,
                message="User profiles retrieved successfully",
                data=user_files,
                total=len(user_files)
            )
        
        # Fallback to file system scan
        users_dir = _get_users_dir()

        user_files = []
        for file in users_dir.glob("*.png"):
            if file.suffix.lower() == ".png":
                try:
                    stat_result = file.stat()
                    
                    # Try to read name from PNG metadata (like character cards)
                    user_name = file.stem  # Default to filename stem
                    user_description = ""
                    try:
                        metadata = _read_user_metadata_from_png(file)
                        if metadata:
                            # Check for name in data.name (CharacterCard format)
                            data_section = metadata.get("data", {})
                            if data_section.get("name"):
                                user_name = data_section["name"]
                            elif metadata.get("name"):
                                user_name = metadata["name"]
                            # Also get description if available
                            if data_section.get("description"):
                                user_description = data_section["description"]
                    except Exception as meta_error:
                        logger.log_warning(f"Could not read metadata from {file.name}: {meta_error}")
                    
                    user_files.append({
                        "name": user_name,
                        "filename": file.name,
                        "description": user_description,
                        "modified": stat_result.st_mtime
                    })
                except OSError as stat_error:
                    logger.log_warning(f"Could not stat file {file.name}: {stat_error}")

        # Sort by name (case-insensitive)
        user_files.sort(key=lambda x: x["name"].lower())

        logger.log_step(f"Found {len(user_files)} user profiles (from file system)")
        return ListResponse(
            success=True,
            message="User profiles retrieved successfully",
            data=user_files,
            total=len(user_files)
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

        users_dir = _get_users_dir()
        file_path = users_dir / filename
        logger.log_step(f"Attempting to serve user image: {file_path}")

        if not file_path.is_file(): # Check if it's a file and exists
            logger.log_warning(f"User image not found: {file_path}")
            raise NotFoundException("User image not found")

        # Basic check for image type based on extension
        if file_path.suffix.lower() != ".png":
             logger.log_warning(f"Requested user file is not a PNG: {filename}")
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
    request: Request,
    file: UploadFile = File(...),
    metadata: str = Form(default="{}"),
    logger: LogManager = Depends(get_logger_dependency)
):
    """Upload a new user profile PNG image with metadata."""
    try:
        users_dir = _get_users_dir()

        # Check file content type - allow common image types, will convert to PNG
        content_type = file.content_type
        if not content_type or not content_type.startswith("image/"):
            logger.log_warning(f"Invalid file type for user image: {content_type}")
            raise ValidationException("Only image files are allowed")

        # Parse metadata to get user name
        user_metadata = {}
        user_name = None
        try:
            user_metadata = json.loads(metadata)
            # Check CharacterCard format: data.name
            data_section = user_metadata.get("data", {})
            user_name = data_section.get("name") or user_metadata.get("name")
            logger.log_step(f"Parsed user metadata, name: {user_name}")
        except json.JSONDecodeError as e:
            logger.log_warning(f"Failed to parse metadata JSON: {e}")

        # Determine filename: prefer user name from metadata, fallback to original filename
        if user_name:
            base_name = user_name.strip()
        else:
            orig_filename = file.filename or "user.png"
            base_name = Path(orig_filename).stem

        # Ensure the filename is safe
        safe_name = ''.join(c for c in base_name if c.isalnum() or c in ['_', '-', ' '])
        safe_name = safe_name.strip()
        if not safe_name:
            safe_name = "user"  # Fallback if name becomes empty after sanitization
        safe_name = safe_name[:50]  # Limit length

        new_filename = f"{safe_name}.png"
        file_path = users_dir / new_filename

        # Handle potential filename conflicts by adding a timestamp
        counter = 0
        while file_path.exists():
            counter += 1
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            new_filename = f"{safe_name}_{timestamp}_{counter}.png"
            file_path = users_dir / new_filename
            if counter > 10:
                logger.log_error("Could not generate unique filename after multiple attempts.")
                raise ValidationException("Failed to generate unique filename")

        # Read the uploaded file content
        content = await file.read()
        
        # Convert to PNG if necessary and write metadata
        try:
            # If we have user metadata, write it to the PNG
            if user_metadata:
                output_bytes = _write_user_metadata_to_png(content, user_metadata)
            else:
                # Just ensure it's a valid PNG
                with Image.open(BytesIO(content)) as img:
                    output = BytesIO()
                    img.save(output, format="PNG")
                    output_bytes = output.getvalue()
            
            # Save the file
            with open(file_path, "wb") as f:
                f.write(output_bytes)
            logger.log_step(f"User image saved: {file_path}")
            
            # Update database index if service is available
            user_profile_service = getattr(request.app.state, 'user_profile_service', None)
            if user_profile_service:
                try:
                    user_profile_service.sync_users_directory()
                except Exception as sync_error:
                    logger.log_warning(f"Failed to sync user profile to database: {sync_error}")
                    
        except IOError as write_error:
            logger.log_error(f"Failed to write user image file {file_path}: {write_error}")
            raise ValidationException("Failed to save user image file")

        return create_data_response({
            "filename": new_filename,
            "path": str(file_path)  # Return server-side path for reference
        }, "User image created successfully")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error creating user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to create user image")

@router.delete("/user/{filename}", response_model=DataResponse[dict])
async def delete_user_image(
    request: Request,
    filename: str, 
    logger: LogManager = Depends(get_logger_dependency)
):
    """Delete a user profile image file (sends to trash if possible)."""
    try:
        # Security check: prevent directory traversal
        if ".." in filename or "/" in filename or "\\" in filename:
            logger.log_warning(f"Suspicious user image filename requested for deletion: {filename}")
            raise ValidationException("Invalid filename")

        users_dir = _get_users_dir()
        file_path = users_dir / filename
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
             logger.log_warning("send2trash module not found. Falling back to direct deletion.")
             os.remove(file_path)
             logger.log_step(f"User image deleted directly: {file_path}")
        except Exception as trash_error:
             logger.log_error(f"Error sending user image to trash: {trash_error}. Falling back to direct deletion.")
             os.remove(file_path)
             logger.log_step(f"User image deleted directly after trash error: {file_path}")

        # Update database index if service is available
        user_profile_service = getattr(request.app.state, 'user_profile_service', None)
        if user_profile_service:
            try:
                user_profile_service.sync_users_directory()
            except Exception as sync_error:
                logger.log_warning(f"Failed to sync user profile deletion to database: {sync_error}")

        return create_data_response({
            "filename": filename
        }, f"User image '{filename}' deleted successfully")

    except (ValidationException, NotFoundException):
        raise
    except Exception as e:
        logger.log_error(f"Error deleting user image: {str(e)}")
        logger.log_error(traceback.format_exc())
        handle_generic_error(e, "Failed to delete user image")