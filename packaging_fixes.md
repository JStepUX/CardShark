# CardShark PyInstaller Packaging Fixes

## Overview
This document outlines the fixes implemented to make the CardShark application properly package with PyInstaller for production deployment. The fixes focus on robust file path handling, database integration, and ensuring lore image functionality works in the bundled executable.

## Issues Fixed

### 1. Character Service Path Handling
- Added robust path resolution in the `character_service.py` file to handle various deployment scenarios
- Fixed imports in `character_service.py` by adding proper sys.path manipulation
- Enhanced the `to_api_model` function to handle both string and dict/list data types for JSON fields

### 2. Character Endpoints Path Resolution
- Implemented multi-level path resolution in character image and metadata endpoints
- Added fallback mechanisms to handle different runtime environments

### 3. Build Configuration Updates
- Added the services directory to the PyInstaller data files
- Added the uploads directory structure to the PyInstaller data files
- Added the SQLite database file to the PyInstaller data files
- Fixed the PyInstaller spec file to handle empty directories

### 4. Directory Structure Creation
- Created the necessary `uploads/lore_images` directory for storing lore images
- Set up proper directory structure detection and creation at runtime

### 5. Database Integration
- Ensured the database is properly initialized before packaging
- Added database file to the PyInstaller package

## Testing
- Verified that the application builds successfully with PyInstaller
- Confirmed that all paths are resolved correctly in the packaged application
- Tested that the character endpoints function properly

## Next Steps
1. Deploy the packaged application in a fresh environment
2. Verify that lore image upload functionality works correctly
3. Consider adding an automated test suite for the packaged application

## Implementation Details

### Path Resolution Logic
The key improvement is implementing multi-level path resolution:
```python
# Try to be more robust with path resolution
try:
    # First try with the path as is
    file_path = Path(fixed_path)
    
    # If the path is not absolute or doesn't exist, try relative to app root
    if not file_path.is_absolute() or not file_path.exists():
        app_root = Path(__file__).parent.parent.parent
        file_path = app_root / fixed_path
        
        # Try character directory as fallback
        if not file_path.exists():
            characters_dir = app_root / "characters"
            file_path = characters_dir / Path(fixed_path).name
```

### PyInstaller Configuration
The key changes to the PyInstaller spec file:
```python
backend_datas = [
    # Existing entries...
    ('backend/services/*.py', 'backend/services'),  # Add services directory
    ('uploads', 'uploads'),  # Add uploads directory
    ('cardshark.sqlite', '.')  # Add SQLite database file
]
```

### JSON Field Handling
Enhanced the JSON field handling to work with both string and dict/list types:
```python
# Check if tags is already a dict/list or if it needs to be parsed from JSON string
if db_char.tags:
    if isinstance(db_char.tags, str):
        api_char.tags = json.loads(db_char.tags)
    else:
        # If it's already a list/dict, use it directly
        api_char.tags = db_char.tags
```
