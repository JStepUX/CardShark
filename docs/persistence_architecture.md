# CardShark Persistence Architecture

This document provides a comprehensive overview of CardShark's persistence architecture, designed to serve as a reference for both human developers and AI assistants working on the project. It ties together the domain-specific persistence strategies into a cohesive whole.

## Architecture Overview

CardShark employs a domain-driven approach to data persistence, where each domain has its dedicated storage mechanism and patterns. This architecture promotes:

1.  **Separation of concerns**: Each domain manages its own data independently
2.  **Domain-specific optimizations**: Storage formats and patterns optimized for each data type
3.  **Clear boundaries**: Well-defined interfaces between different data domains
4.  **Consistent patterns**: Common persistence patterns applied across domains

## Core Persistence Principles

These principles apply across all persistence domains in CardShark:

### 1. Data Integrity

- All write operations use atomic patterns to prevent corruption
- Critical operations include verification steps
- Backup mechanisms protect against data loss
- All data formats include validation schemas

### 2. Performance Optimization

- Debounced writes prevent excessive I/O operations
- Read operations are optimized with appropriate caching
- Batch operations are used for bulk data changes
- Save operations prioritize critical state changes

### 3. Error Recovery

- All persistence operations include robust error handling
- Automatic recovery mechanisms for common failure scenarios
- Detailed logging for troubleshooting
- Fallback strategies when primary persistence fails

### 4. Versioning

- All data formats include explicit version information
- Migration paths for evolving schemas
- Backward compatibility with older data formats
- Forward compatibility where possible

## Domain-Specific Persistence

### Settings
- **Primary location**: `settings.json` in the root directory
- **Format**: JSON configuration file
- **Backend handler**: `settings_manager.py`
- **API endpoints**: `settings_endpoints.py`
- **Access patterns**:
    - Read on application startup
    - Updated when settings are changed via the settings interface
    - Settings include API configurations, UI preferences, and application defaults

### Characters
- **Primary location**: User-selected directory via DirectoryPicker (configured in settings)
- **Format**: PNG files with metadata embedded using the `png_metadata_handler.py`
- **Key files**:
    - Each character is a single PNG file with embedded JSON metadata
    - Character data follows the Character Card format specification
- **Backend handlers**:
    - `character_endpoints.py` for CRUD operations
    - `character_validator.py` for validation
    - `png_metadata_handler.py` for reading/writing PNG metadata
- **Access patterns**:
    - Characters are loaded on demand when selected in the gallery
    - Character data is cached in memory while in use
    - Changes are persisted immediately when characters are edited
- **Detailed spec**: See Character Card format specification

### Chats
- **Primary location**: `/chats/{{characterName}}/` directory
- **Format**: JSONL files with metadata header and message entries (older chats might be JSON files with UUIDs as filenames).
- **Organization**:
    - Each character has its own subdirectory
    - `folders.json` may map UUIDs to character names for efficient lookup in older chat versions.
- **Key handlers**: `chat_handler.py`, `chat_endpoints.py`
- **Frontend service**: `ChatStorage` service in the frontend
- **Access patterns**:
    - Chat history is loaded when a character is selected
    - New messages are appended to the current chat file
    - Chat lists are loaded when the chat selector is opened
- **Detailed strategy**: See `chat_persistence_strategy.md`

### Worlds
- **Primary location**: `/worlds/{worldName}/` directories
- **Format**: JSON for state (`world_state.json`), PNG for images, JSONL for chats
- **Key handlers**: `world_state_manager.py`, `world_endpoints.py`, `world_chat_endpoints.py`, `room_card_endpoint.py`
- **Access patterns**:
    - World data is loaded when a world is selected
    - Room states are updated during world play
    - NPC interactions are tracked in world state
- **Detailed strategy**: See `world_persistence_strategy.md`

### Templates
- **Primary location**: `/templates/` directory
- **Format**: JSON files with template definitions
- **Key handlers**: `template_handler.py`, `template_endpoints.py`
- **Organization**: Built-in (read-only) and custom templates
- **Access patterns**:
    - Templates are loaded on application startup
    - Custom templates can be created, edited, and deleted
    - Built-in templates are read-only

### Users
- **Primary location**: `/users/` directory
- **Format**: PNG files with embedded JSON metadata (similar to characters)
- **Key handlers**: `user_endpoints.py`
- **Access patterns**:
    - Users are loaded when the user selection dialog is opened
    - User profiles include name, avatar, and preferences

### Backgrounds
- **Primary location**: `/backgrounds/` directory
- **Format**: Image files (PNG, JPG, GIF) with metadata
- **Metadata storage**: `metadata.json` in the backgrounds directory
- **Backend handlers**:
    - `background_endpoints.py` for API operations
    - `background_handler.py` for business logic
- **Access patterns**:
    - Backgrounds are loaded on demand
    - Metadata includes display name, categories, and customization options

### Context
- **Primary location**: `/context/` directory
- **Format**: JSON files with context information
- **Key files**: `latest_context.json` for the most recent context window
- **Access patterns**:
    - Context windows are saved for debugging and analysis
    - Context history can be viewed in the Context Window Modal

## Common Implementation Patterns

### Atomic File Operations
All domains implement atomic file operations following this pattern:

```python
import os
import uuid
import json
# Assuming logger is configured elsewhere
# import logging
# logger = logging.getLogger(__name__)

def atomic_write(target_path, data):
    # Create temporary file with unique name
    # Ensure target_path is a Path object if using .with_name, or construct string path carefully
    temp_path_str = str(target_path.parent / f"{target_path.stem}.{uuid.uuid4()}.tmp")

    try:
        # Write data to temporary file
        with open(temp_path_str, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2) # Assuming JSON data for this example
            
        # Ensure data is fully written to disk (platform dependent, os.fsync is best effort)
        # For critical data, consider additional checks or journaling mechanisms if available
        # On POSIX systems, fsync the file descriptor then the directory
        # For simplicity here, we'll just flush
        # f.flush() # flush is called automatically when 'with' block exits for text files
        # os.fsync(f.fileno()) # This would require f to be open or to reopen in binary for fileno
        
        # Atomic replace
        os.replace(temp_path_str, str(target_path))
        # logger.info(f"Successfully wrote to {target_path}")
        return True
    except Exception as e:
        # logger.error(f"Atomic write to {target_path} failed: {str(e)}")
        if os.path.exists(temp_path_str):
            try:
                os.unlink(temp_path_str)
            except Exception as e_unlink:
                # logger.error(f"Failed to delete temporary file {temp_path_str}: {e_unlink}")
                pass
        return False
```

### Validation Patterns
Data validation follows this general pattern:
```python
# Assuming appropriate schema validation tools (e.g., Pydantic, jsonschema)
# class ValidationError(Exception): pass
# def get_schema_for_version(schema_version): pass # Placeholder
# def validate_against_schema(data, schema): pass # Placeholder
# def domain_specific_validation(data): pass # Placeholder

def validate_data(data, schema_version):
    try:
        # Get appropriate schema for version
        schema = get_schema_for_version(schema_version)
        
        # Validate against schema
        validate_against_schema(data, schema)
        
        # Additional domain-specific validation
        domain_specific_validation(data)
        
        return True, None
    # except ValidationError as e: # Catch specific validation error
        # return False, f"Validation error: {str(e)}"
    except Exception as e: # Generic catch for placeholder
        return False, f"Validation error: {str(e)}"

```

### Debounced Save Operations
Performance optimization with debounced saves:
```python
import threading

class DebouncedSaver:
    def __init__(self, save_func, delay_ms=500):
        self.save_func = save_func
        self.delay_ms = delay_ms
        self.timer = None
        self.pending_data = None
        self._lock = threading.Lock() # To protect pending_data and timer
        
    def schedule_save(self, data):
        with self._lock:
            self.pending_data = data
            
            if self.timer:
                self.timer.cancel()
                
            self.timer = threading.Timer(
                self.delay_ms / 1000.0, 
                self._execute_save
            )
            self.timer.daemon = True # Ensure timer doesn't block program exit
            self.timer.start()
            
    def _execute_save(self):
        with self._lock:
            if self.pending_data is not None:
                try:
                    self.save_func(self.pending_data)
                    self.pending_data = None # Clear data after successful save
                except Exception as e:
                    # logger.error(f"Debounced save failed: {e}")
                    # Optionally, implement retry logic or keep pending_data for next attempt
                    pass # For now, just log and clear
                finally:
                    self.timer = None # Clear the timer
    
    def cancel(self):
        with self._lock:
            if self.timer:
                self.timer.cancel()
                self.timer = None
            self.pending_data = None

```

## Cross-Domain Interactions
Different persistence domains interact in structured ways:

1.  **Characters → Chats**: Character IDs link to chat directories
2.  **Characters → Worlds**: Character cards can generate worlds
3.  **Worlds → Characters**: Worlds reference character UUIDs for NPCs
4.  **Templates → Chats**: Templates are applied in chat contexts
5.  **Settings → All Domains**: Settings configure all persistence behaviors

## Service Layer
Each storage domain has a corresponding service layer that abstracts implementation details:

### Backend Services
- **`settings_manager.py`**: Manages application settings
- **`png_metadata_handler.py`**: Handles reading/writing PNG metadata
- **`chat_handler.py`**: Manages chat operations
- **`lore_handler.py`**: Handles character lore entries
- **`background_handler.py`**: Manages background resources
- **`world_state_manager.py`**: Handles world state persistence
- **`template_handler.py`**: Handles template loading and saving

### Frontend Services
- **`ChatStorage`**: Manages chat operations from the frontend
- **`TemplateService`**: Handles template operations
- **`CharacterService`**: Manages character operations
- **`SettingsService`**: Handles settings operations
- **`WorldService`**: Manages world operations

## API Integration
Frontend components interact with the backend storage through a set of REST APIs:

- **GET endpoints**: Used for reading data
- **POST endpoints**: Used for creating or updating data
- **DELETE endpoints**: Used for removing data
- **PATCH endpoints**: Used for partial updates for large data structures (consider for future)

Example API patterns:
```typescript
// Assuming apiService is a configured client
// Reading chat history
// const chatHistory = await apiService.fetchData(`chat/${characterId}/history`);

// Saving a message
// await apiService.saveData(`chat/${characterId}/message`, {
//   message: newMessage,
//   timestamp: Date.now()
// });
```

## Best Practices
When working with CardShark's storage architecture:

1.  **Use domain-specific services** for each type of data
2.  **Follow the established patterns** for each domain
3.  **Handle errors gracefully** when storage operations fail
4.  **Implement proper validation** before persisting data
5.  **Optimize for performance** with appropriate caching strategies
6.  **Maintain backward compatibility** when changing storage formats

## Future Enhancements
Planned improvements to the persistence architecture:

1.  **Database Migration**: For higher scalability in high-volume domains
2.  **Distributed Storage**: For multi-device synchronization
3.  **Conflict Resolution**: For collaborative editing scenarios
4.  **Compression Strategies**: For reducing storage footprint
5.  **Encryption Options**: For sensitive data
6.  **Versioned storage**: To support backward compatibility (also mentioned under Core Principles)

## Troubleshooting Guide
Common persistence issues and their solutions:

### General Issues
- **Missing Files**: Check file permissions and directory existence. Verify paths are correct.
- **Corruption**: Use validation utilities and recover from backups if available. Implement checksums for critical files.
- **Performance**: Implement appropriate caching, optimize save frequency (debouncing), and consider pagination for large datasets.
- **Synchronization**: Verify frontend and backend state consistency. Implement ETag or last-modified headers for caching.

### Domain-Specific Issues
- **Character Card Problems**: Check PNG metadata integrity. Ensure EXIFtool or chosen library works correctly.
- **Chat History Issues**: Validate JSONL format and structure. Ensure atomic appends or full rewrites are handled safely.
- **World State Errors**: Verify JSON schema compliance. Check for race conditions if multiple users/processes can modify.
- **Settings Conflicts**: Check for concurrent modifications. Consider a lock file or versioning for settings.

This architecture provides a comprehensive approach to persistence in CardShark, ensuring reliable data storage while maintaining performance and scalability across all domains.