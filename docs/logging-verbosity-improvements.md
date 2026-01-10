# Logging Verbosity Improvements

## Summary
Reduced terminal verbosity during gallery/character loading while maintaining detailed logs in files. The terminal now shows clean summaries instead of verbose per-card metadata parsing details.

## Changes Made

### 1. LogManager - Verbosity Level System (`backend/log_manager.py`)
- Added verbosity level constants (DEBUG=0, INFO=1, WARNING=2, ERROR=3)
- Added `console_verbosity` parameter to `__init__` (defaults to INFO level)
- Updated `log_step()` to accept a `level` parameter
- Logs are always written to file, but only printed to console if level >= console_verbosity

### 2. PNG Metadata Handler (`backend/png_metadata_handler.py`)
- Changed all verbose metadata parsing logs to use `level=0` (DEBUG)
- This includes:
  - Base64 decoding steps
  - EXIF data extraction
  - Metadata structure inspection
  - JSON parsing details
- These details are still logged to file but no longer spam the terminal

### 3. Character Sync Service (`backend/services/character_sync_service.py`)
- Added statistics tracking for sync operations
- Displays clean summary after sync:
  ```
  ==================================================
  (172/181) Cards Loaded Successfully
  5 new cards imported.
  3 cards updated.
  1 cards failed to load (see log for details).
  ==================================================
  ```
- Returns action type ('new', 'updated', 'unchanged') from `_process_character_file()`

### 4. Main Application (`backend/main.py`)
- Initialize logger with INFO level console verbosity: `LogManager(console_verbosity=1)`

### 5. Character Indexing Service (`backend/services/character_indexing_service.py`)
- Changed UUID duplicate constraint failures from errors to DEBUG-level logs
- These failures just mean "we already have this character" - not a real problem
- No more scary error messages with exclamation marks for expected duplicates
- Real database errors still logged as errors

## Result

**Before:**
```
[10:47:24.972] Attempting to get EXIF data using _getexif
[10:47:24.989] No EXIF data found via _getexif
[10:47:24.989] Found 'chara' metadata in image.info (non-EXIF), attempting to decode.
[10:47:24.990] Decoding metadata of type: <class 'str'>
[10:47:24.991] Cleaned data length: 13996
[10:47:24.991] Encoded data sample: eyJkYXRhIjogeyJuYW1lIjogIkVtaW...
[10:47:24.992] Successfully decoded with standard base64
[10:47:24.993] Decoded base64 to UTF-8 string
... (repeated 181 times)
```

**After:**
```

 ______     ______     ______     _____     ______     __  __     ______     ______     __  __    
/\  ___\   /\  __ \   /\  == \   /\  __-.  /\  ___\   /\ \_\ \   /\  __ \   /\  == \   /\ \/ /    
\ \ \____  \ \  __ \  \ \  __<   \ \ \/\ \ \ \___  \  \ \  __ \  \ \  __ \  \ \  __<   \ \  _"-.  
 \ \_____\  \ \_\ \_\  \ \_\ \_\  \ \____-  \/\_____\  \ \_\ \_\  \ \_\ \_\  \ \_\ \_\  \ \_\ \_\ 
  \/_____/   \/_/\/_/   \/_/ /_/   \/____/   \/_____/   \/_/\/_/   \/_/\/_/   \/_/ /_/   \/_/\/_/ 
                                                                                                  

Development Server
========================
Backend will run on: http://localhost:9696
Backend LAN Access: http://192.168.1.16:9696
Frontend will run on: http://localhost:6969
Frontend LAN Access: http://192.168.1.16:6969

==================================================
(172/181) Cards Loaded Successfully
5 new cards imported.
3 cards updated.
1 cards failed to load (see log for details).
==================================================

==================================================
User Profiles Sync Complete
Total: 14 | New: 0 | Updated: 0 | Skipped: 14
==================================================

Press CTRL+C to quit
```

## Benefits

1. **Clean Terminal**: Users can easily see the IP address and important information
2. **Full Logs Preserved**: All verbose details are still in the log files for debugging
3. **Better UX**: Clear summary of what happened during sync
4. **Flexible**: Can easily adjust verbosity levels if needed

## Verbosity Levels

- **DEBUG (0)**: All details (only in log files by default)
- **INFO (1)**: Important information (default console level)
- **WARNING (2)**: Warnings and above
- **ERROR (3)**: Errors only

To change verbosity, modify the `console_verbosity` parameter when creating LogManager:
```python
logger = LogManager(console_verbosity=0)  # Show everything (DEBUG)
logger = LogManager(console_verbosity=2)  # Only warnings and errors
```
