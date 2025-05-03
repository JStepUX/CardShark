# CardShark Storage Architecture

This document provides a comprehensive overview of CardShark's storage architecture, designed to serve as a reference for both human developers and AI assistants working on the project.

## Overview

CardShark employs a domain-driven approach to data storage, where each domain has its dedicated storage mechanism. This architecture promotes separation of concerns, allows for domain-specific optimizations, and enables independent scaling of high-traffic parts of the application.

## Storage Locations

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

### Chats
- **Primary location**: `/chats/{{characterName}}/` directory 
- **Format**: JSON files with unique UUIDs as filenames
- **Organization**: 
  - Each character has its own subdirectory
  - `folders.json` maps UUIDs to character names for efficient lookup
- **Backend handlers**: 
  - `chat_endpoints.py` for API operations
  - `chat_handler.py` for business logic
- **Frontend service**: `ChatStorage` service in the frontend
- **Access patterns**:
  - Chat history is loaded when a character is selected
  - New messages are appended to the current chat file
  - Chat lists are loaded when the chat selector is opened

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

### Users
- **Primary location**: `/users/` directory
- **Format**: PNG files with embedded metadata (similar to characters)
- **Backend handler**: `user_endpoints.py`
- **Access patterns**:
  - Users are loaded when the user selection dialog is opened
  - User profiles include name, avatar, and preferences

### Templates
- **Primary location**: `/templates/` directory
- **Format**: JSON files with template definitions
- **Backend handlers**:
  - `template_endpoints.py` for API operations
  - `template_handler.py` for business logic
- **Access patterns**:
  - Templates are loaded on application startup
  - Custom templates can be created, edited, and deleted
  - Built-in templates are read-only

### Worlds
- **Primary location**: `/worlds/` directory
- **Format**: JSON files with world definitions and associated resources
- **Backend handlers**:
  - `world_endpoints.py` for world CRUD operations
  - `world_chat_endpoints.py` for world chat operations
  - `world_state_manager.py` for managing world state
  - `room_card_endpoint.py` for room-specific operations
- **State storage**: `world_state.json` for active world state
- **Access patterns**:
  - World data is loaded when a world is selected
  - Room states are updated during world play
  - NPC interactions are tracked in world state

### Context
- **Primary location**: `/context/` directory
- **Format**: JSON files with context information
- **Key files**: `latest_context.json` for the most recent context window
- **Access patterns**:
  - Context windows are saved for debugging and analysis
  - Context history can be viewed in the Context Window Modal

## Service Layer

Each storage domain has a corresponding service layer that abstracts the storage implementation details:

### Backend Services
- **`settings_manager.py`**: Manages application settings
- **`png_metadata_handler.py`**: Handles reading/writing PNG metadata
- **`chat_handler.py`**: Manages chat operations
- **`lore_handler.py`**: Handles character lore entries
- **`background_handler.py`**: Manages background resources
- **`world_state_manager.py`**: Handles world state persistence

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

Example API patterns:
```typescript
// Reading chat history
const chatHistory = await apiService.fetchData(`chat/${characterId}/history`);

// Saving a message
await apiService.saveData(`chat/${characterId}/message`, {
  message: newMessage,
  timestamp: Date.now()
});
```

## Best Practices

When working with CardShark's storage architecture:

1. **Use domain-specific services** for each type of data
2. **Follow the established patterns** for each domain
3. **Handle errors gracefully** when storage operations fail
4. **Implement proper validation** before persisting data
5. **Optimize for performance** with appropriate caching strategies
6. **Maintain backward compatibility** when changing storage formats

## Troubleshooting

Common storage-related issues and their solutions:

- **Missing files**: Check file permissions and ensure directories exist
- **Corrupted data**: Use the validation utilities to check file integrity
- **Performance issues**: Implement pagination for large datasets
- **Sync problems**: Verify that frontend state matches backend state

## Future Considerations

As CardShark evolves, consider these storage architecture improvements:

- **Database migration**: For higher scalability and query capabilities
- **Versioned storage**: To support backward compatibility
- **Cloud synchronization**: For multi-device support
- **Compression**: For reducing storage footprint