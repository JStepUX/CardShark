---
description: Consolidate image storage handling into a unified ImageStorageService
---

# ImageStorageService Consolidation Refactor

## Problem Statement

The codebase has **4 separate implementations** for handling non-metadata image storage, with inconsistent path handling that breaks in PyInstaller bundles:

| Handler | File | Issue |
|---------|------|-------|
| Lore Images | `backend/services/character_service.py` | ✅ Fixed - uses `get_application_base_path()` |
| Backgrounds | `backend/background_handler.py` | Has own `_get_backgrounds_dir()` with duplicate PyInstaller logic |
| World Assets | `backend/world_asset_handler.py` | Uses `Path(base_path)` passed from caller - fragile |
| General Uploads | `backend/main.py` lines 774, 814 | ❌ Uses `Path("uploads")` - CWD-dependent, BROKEN |

## Goal

Create a unified `ImageStorageService` that:
1. Uses `get_application_base_path()` from `backend/utils/path_utils.py` for consistent path resolution
2. Works in both dev mode and PyInstaller bundles
3. Provides a single API for save/delete/get operations
4. Consolidates all non-metadata image storage under `{app_base}/uploads/{category}/`

## Existing Utility to Use

```python
# backend/utils/path_utils.py - already exists and is correct
def get_application_base_path() -> Path:
    if is_pyinstaller_bundle():
        return Path(sys.executable).parent  # EXE directory
    else:
        return Path(__file__).resolve().parent.parent.parent  # Project root
```

## Implementation Steps

### Step 1: Create ImageStorageService

Create `backend/services/image_storage_service.py`:

```python
"""Unified service for non-metadata image storage."""
import os
import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

from backend.utils.path_utils import get_application_base_path
from backend.log_manager import LogManager


class ImageStorageService:
    """
    Centralized service for storing images that don't require PNG metadata embedding.
    Handles: lore images, backgrounds, world assets, general uploads.
    """

    # Known categories and their subdirectory structure
    CATEGORIES = {
        "lore_images": "{owner_uuid}",      # uploads/lore_images/{char_uuid}/
        "backgrounds": "",                   # uploads/backgrounds/
        "world_assets": "{owner_uuid}",      # uploads/world_assets/{world_uuid}/
        "general": "",                       # uploads/general/
    }

    def __init__(self, logger: LogManager):
        self.logger = logger
        self.base_path = get_application_base_path() / "uploads"
        self._ensure_base_directory()

    def _ensure_base_directory(self):
        """Ensure the base uploads directory exists."""
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_category_path(self, category: str, owner_uuid: Optional[str] = None) -> Path:
        """
        Get the storage path for a category.
        
        Args:
            category: One of CATEGORIES keys (lore_images, backgrounds, etc.)
            owner_uuid: Required for categories that use owner-based subdirs
            
        Returns:
            Absolute Path to the storage directory
        """
        if category not in self.CATEGORIES:
            raise ValueError(f"Unknown category: {category}. Valid: {list(self.CATEGORIES.keys())}")
        
        category_pattern = self.CATEGORIES[category]
        
        if "{owner_uuid}" in category_pattern:
            if not owner_uuid:
                raise ValueError(f"Category '{category}' requires owner_uuid")
            subdir = category_pattern.replace("{owner_uuid}", owner_uuid)
        else:
            subdir = category_pattern
        
        if subdir:
            path = self.base_path / category / subdir
        else:
            path = self.base_path / category
            
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_image(
        self,
        category: str,
        file_data: bytes,
        original_filename: str,
        owner_uuid: Optional[str] = None,
        custom_filename: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Save an image file.
        
        Args:
            category: Storage category
            file_data: Raw bytes of the image
            original_filename: Original filename (used to determine extension)
            owner_uuid: Owner identifier (required for some categories)
            custom_filename: Optional custom filename (without extension)
            
        Returns:
            Dict with keys: filename, absolute_path, relative_url
        """
        storage_dir = self.get_category_path(category, owner_uuid)
        
        # Determine extension
        extension = Path(original_filename).suffix.lower()
        if not extension:
            extension = ".png"  # Default
        
        # Generate filename
        if custom_filename:
            filename = f"{custom_filename}{extension}"
        else:
            filename = f"{uuid.uuid4()}{extension}"
        
        file_path = storage_dir / filename
        
        # Write file
        with open(file_path, "wb") as f:
            f.write(file_data)
        
        self.logger.log_info(f"Saved image: {file_path}")
        
        # Build relative URL
        if owner_uuid:
            relative_url = f"/uploads/{category}/{owner_uuid}/{filename}"
        else:
            relative_url = f"/uploads/{category}/{filename}"
        
        return {
            "filename": filename,
            "absolute_path": str(file_path),
            "relative_url": relative_url
        }

    def delete_image(
        self,
        category: str,
        filename: str,
        owner_uuid: Optional[str] = None
    ) -> bool:
        """Delete an image file."""
        storage_dir = self.get_category_path(category, owner_uuid)
        file_path = storage_dir / filename
        
        if file_path.exists():
            try:
                # Try send2trash first
                try:
                    import send2trash
                    send2trash.send2trash(str(file_path))
                except ImportError:
                    os.remove(file_path)
                self.logger.log_info(f"Deleted image: {file_path}")
                return True
            except Exception as e:
                self.logger.log_error(f"Failed to delete {file_path}: {e}")
                return False
        return False

    def get_image_path(
        self,
        category: str,
        filename: str,
        owner_uuid: Optional[str] = None
    ) -> Optional[Path]:
        """Get the absolute path to an image if it exists."""
        storage_dir = self.get_category_path(category, owner_uuid)
        file_path = storage_dir / filename
        return file_path if file_path.exists() else None
```

### Step 2: Update main.py

1. Initialize the service in lifespan:
```python
app.state.image_storage_service = ImageStorageService(logger)
```

2. Fix general uploads endpoint (around line 774):
```python
@app.post("/api/upload-image")
async def upload_image(request: Request, file: UploadFile = File(...)):
    service = request.app.state.image_storage_service
    content = await file.read()
    result = service.save_image("general", content, file.filename)
    return JSONResponse({"success": True, "url": result["relative_url"]})
```

3. Keep the existing `/uploads` static mount - it's already fixed.

### Step 3: Migrate lore_endpoints.py

Replace `save_lore_image()` helper function to use the service:

```python
# In upload_lore_image endpoint:
service = request.app.state.image_storage_service
result = service.save_image(
    category="lore_images",
    file_data=await image_file.read(),
    original_filename=image_file.filename,
    owner_uuid=character_identifier
)
image_uuid = result["filename"]  # Now includes extension
image_path = result["relative_url"]
```

### Step 4: Migrate background_handler.py

Refactor to use ImageStorageService internally:
- Keep the metadata handling (metadata.json) as-is
- Replace file save/delete operations with service calls
- Remove duplicate `_get_backgrounds_dir()` logic

### Step 5: Migrate world_asset_handler.py

Similar pattern - use the service for file operations:
- `save_asset()` → `service.save_image("world_assets", ...)`
- `delete_asset()` → `service.delete_image("world_assets", ...)`

### Step 6: Cleanup

Remove:
- `CharacterService._ensure_lore_image_directory()` - service handles it
- `CharacterService.get_lore_image_paths()` - service provides this
- `BackgroundHandler._get_backgrounds_dir()` - service handles it
- Duplicate `sys.frozen` checks scattered throughout

## Testing Checklist

- [ ] Lore images upload and display correctly
- [ ] Lore image thumbnails appear in LoreCard
- [ ] Background images upload and display
- [ ] World assets save and load
- [ ] General image uploads work (rich text editor)
- [ ] All of the above work when running as PyInstaller bundle

## Files to Modify

1. **Create**: `backend/services/image_storage_service.py`
2. **Modify**: `backend/main.py` - initialize service, fix upload endpoint
3. **Modify**: `backend/lore_endpoints.py` - use service
4. **Modify**: `backend/services/character_service.py` - remove image helpers
5. **Modify**: `backend/background_handler.py` - use service
6. **Modify**: `backend/world_asset_handler.py` - use service

## Priority

Medium - The immediate lore image issue is fixed. This refactor improves maintainability and prevents future bugs.
