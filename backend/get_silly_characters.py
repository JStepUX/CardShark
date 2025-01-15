import os
from fastapi import HTTPException # type: ignore
from pathlib import Path

@app.get("/api/silly-characters") # type: ignore
async def get_silly_characters():
    """Scan the SillyTavern characters directory for PNG files."""
    try:
        # Get current user's home directory
        user_home = str(Path.home())
        
        # Construct path to SillyTavern characters directory
        characters_path = Path(user_home) / "SillyTavern-Launcher" / "SillyTavern" / "data" / "default-user" / "characters"
        
        # Check if directory exists
        if not characters_path.exists():
            return {
                "exists": False,
                "message": "SillyTavern characters directory not found",
                "files": []
            }
            
        # List all PNG files
        png_files = []
        for file in characters_path.glob("*.png"):
            png_files.append({
                "name": file.stem,  # Filename without extension
                "path": str(file),  # Full path
                "size": file.stat().st_size,
                "modified": file.stat().st_mtime
            })
            
        # Sort alphabetically by name
        png_files.sort(key=lambda x: x["name"].lower())
        
        return {
            "exists": True,
            "message": "Successfully scanned directory",
            "files": png_files
        }
        
    except Exception as e:
        logger.log_error(f"Error scanning characters directory: {str(e)}") # type: ignore
        raise HTTPException(
            status_code=500,
            detail=f"Failed to scan characters directory: {str(e)}"
        )