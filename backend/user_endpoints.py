# backend/user_endpoints.py
# Implements API endpoints for user profile operations
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
import traceback
import uuid
import os
from datetime import datetime

# Import handlers
from backend.log_manager import LogManager

# Create router
router = APIRouter()

# Initialize local instances (for router pattern)
logger = LogManager()

class UserEndpoints:
    """Encapsulates user profile-related endpoints."""
    
    def __init__(self, logger, settings_manager=None):
        """Initialize with dependencies."""
        self.logger = logger
        self.settings_manager = settings_manager
        
    def register_routes(self, router):
        """Register all user endpoints with the provided router."""
        
        @router.get("/api/users")
        async def list_users():
            """List user profile filenames (PNG) in the users directory."""
            try:
                users_dir = Path("users")
                
                # Create users directory if it doesn't exist
                if not users_dir.exists():
                    users_dir.mkdir(parents=True, exist_ok=True)
                    self.logger.log_step(f"Created users directory: {users_dir}")
                
                user_files = []
                for file in users_dir.glob("*.png"):
                    # Only include PNG files
                    if file.suffix.lower() == ".png":
                        user_files.append({
                            "name": file.stem,
                            "filename": file.name,
                            "modified": file.stat().st_mtime
                        })
                
                # Sort by filename
                user_files.sort(key=lambda x: x["name"].lower())
                
                return JSONResponse(status_code=200, content={
                    "success": True,
                    "users": user_files
                })
                
            except Exception as e:
                self.logger.log_error(f"Error listing users: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")

        @router.get("/api/user-image/{filename}")
        async def get_user_image(filename: str):
            """Serve a user profile image file."""
            try:
                # Security check: prevent directory traversal
                if ".." in filename or "/" in filename or "\\" in filename:
                    self.logger.log_warning(f"Suspicious filename requested: {filename}")
                    raise HTTPException(status_code=400, detail="Invalid filename")
                
                file_path = Path("users") / filename
                
                if not file_path.exists():
                    self.logger.log_warning(f"User image not found: {file_path}")
                    raise HTTPException(status_code=404, detail="User image not found")
                
                return FileResponse(file_path)
                
            except HTTPException as http_exc:
                # Re-raise HTTP exceptions
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error serving user image: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to serve user image: {str(e)}")

        @router.post("/api/user-image/create")
        async def create_user_image(file: UploadFile = File(...)):
            """Upload a new user profile PNG image."""
            try:
                users_dir = Path("users")
                
                # Create users directory if it doesn't exist
                if not users_dir.exists():
                    users_dir.mkdir(parents=True, exist_ok=True)
                    self.logger.log_step(f"Created users directory: {users_dir}")
                
                # Check file content type
                content_type = file.content_type
                if not content_type or not content_type.startswith("image/"):
                    self.logger.log_warning(f"Invalid file type: {content_type}")
                    raise HTTPException(status_code=400, detail="Only image files are allowed")
                
                # Generate a unique filename based on upload time and original name
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                orig_filename = file.filename or "user"
                orig_name = Path(orig_filename).stem
                
                # Ensure the filename is safe
                safe_name = ''.join(c for c in orig_name if c.isalnum() or c == '_')
                if not safe_name:
                    safe_name = "user"
                
                # Generate new filename
                new_filename = f"{safe_name}.png"
                file_path = users_dir / new_filename
                
                # If file exists, add a suffix
                if file_path.exists():
                    new_filename = f"{safe_name}_{timestamp}.png"
                    file_path = users_dir / new_filename
                
                # Save the file
                with open(file_path, "wb") as f:
                    content = await file.read()
                    f.write(content)
                
                self.logger.log_step(f"User image saved: {file_path}")
                
                return JSONResponse(status_code=201, content={
                    "success": True,
                    "filename": new_filename,
                    "path": str(file_path)
                })
                
            except HTTPException as http_exc:
                # Re-raise HTTP exceptions
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error creating user image: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to create user image: {str(e)}")

        @router.delete("/api/user/{filename}")
        async def delete_user_image(filename: str):
            """Delete a user profile image file."""
            try:
                # Security check: prevent directory traversal
                if ".." in filename or "/" in filename or "\\" in filename:
                    self.logger.log_warning(f"Suspicious filename requested for deletion: {filename}")
                    raise HTTPException(status_code=400, detail="Invalid filename")
                
                file_path = Path("users") / filename
                
                if not file_path.exists():
                    self.logger.log_warning(f"User image not found for deletion: {file_path}")
                    raise HTTPException(status_code=404, detail=f"User image not found: {filename}")
                
                if not file_path.is_file():
                    self.logger.log_warning(f"Not a file: {file_path}")
                    raise HTTPException(status_code=400, detail="Not a file")
                
                # Delete the file
                os.remove(file_path)
                self.logger.log_step(f"User image deleted: {file_path}")
                
                return JSONResponse(status_code=200, content={
                    "success": True,
                    "message": f"User image '{filename}' deleted successfully"
                })
                
            except HTTPException as http_exc:
                # Re-raise HTTP exceptions
                raise http_exc
            except Exception as e:
                self.logger.log_error(f"Error deleting user image: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to delete user image: {str(e)}")

# Add direct routes for router pattern usage
# Example:
# @router.get("/api/user-count")
# async def get_user_count():
#     return {"count": 0}