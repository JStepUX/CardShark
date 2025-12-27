# CardShark API Documentation

This document provides a comprehensive reference for CardShark's FastAPI backend endpoints.

## Base URL

**Development**: `http://localhost:9696`
**Production**: Depends on deployment configuration

## Table of Contents

- [World Cards API](#world-cards-api)
- [Characters API](#characters-api)
- [Chat API](#chat-api)
- [Settings API](#settings-api)
- [Templates API](#templates-api)
- [Content Filters API](#content-filters-api)
- [Background API](#background-api)
- [Rooms API](#rooms-api)

---

## World Cards API

Base path: `/api/world-cards/`

Manages World Cards - dynamic, navigable environments with characters and events.

### List Worlds

```http
GET /api/world-cards/
```

**Response**: Array of available world names

**Example:**
```json
["fantasy-kingdom", "cyberpunk-city", "space-station"]
```

---

### Get World State

```http
GET /api/world-cards/{world_name}/state
```

**Parameters:**
- `world_name` (path) - Name of the world

**Response**: World state object including rooms, NPCs, player position, etc.

**Example Response:**
```json
{
  "world_name": "fantasy-kingdom",
  "current_room": "throne-room",
  "rooms": {
    "throne-room": {
      "name": "Throne Room",
      "description": "A grand hall with marble columns",
      "npcs": ["king", "guard"],
      "events": []
    }
  },
  "player_position": "throne-room"
}
```

---

### Update World State

```http
POST /api/world-cards/{world_name}/state
```

**Parameters:**
- `world_name` (path) - Name of the world

**Request Body**: Updated world state object

**Response**: Success confirmation

---

### Move Player

```http
POST /api/world-cards/{world_name}/move
```

**Parameters:**
- `world_name` (path) - Name of the world

**Request Body:**
```json
{
  "destination": "garden",
  "player_id": "player-uuid"
}
```

**Response**: Updated player position and room information

---

### Create World

```http
POST /api/world-cards/create
```

**Request Body:**
```json
{
  "world_name": "new-world",
  "description": "A mysterious new world",
  "initial_room": "entrance"
}
```

**Response**: Created world state

---

## Characters API

Base path: `/api/characters/`

Manages character data with PNG metadata embedding.

### List Characters

```http
GET /api/characters/
```

**Response**: Array of character objects

**Example:**
```json
[
  {
    "character_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Elena",
    "description": "A brave warrior",
    "file_path": "characters/elena.png"
  }
]
```

---

### Save Character Card

```http
POST /api/characters/save-card
```

**Request**: Multipart form data with PNG file and metadata

**Form Fields:**
- `file` - PNG image file
- `metadata` - JSON string with character data (including `character_uuid`)

**Response**: Saved character with embedded metadata

**Metadata Example:**
```json
{
  "character_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Elena",
  "description": "A brave warrior from the northern kingdoms",
  "personality": "Courageous, loyal, quick-witted",
  "first_message": "Greetings, traveler!"
}
```

---

### Extract Character Metadata

```http
POST /api/characters/extract-metadata
```

**Request**: Multipart form data with PNG file

**Response**: Extracted metadata from PNG EXIF data

---

### Get Character by ID

```http
GET /api/characters/{character_id}
```

**Parameters:**
- `character_id` (path) - Character UUID or name

**Response**: Character object with full metadata

---

## Chat API

Base path: `/api/chat/`

Manages chat sessions and message generation.

### Generate Chat Response

```http
POST /api/chat/generate
```

**Request Body:**
```json
{
  "chat_session_uuid": "abc123-session-uuid",
  "character_id": "elena",
  "message": "Hello!",
  "api_config": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.8
  }
}
```

**Response**: Server-sent events (SSE) stream with AI-generated response

**SSE Event Format:**
```
data: {"token": "Hello", "done": false}
data: {"token": " there", "done": false}
data: {"token": "!", "done": true}
```

---

### List Chat Sessions

```http
GET /api/chat/list/{character_id}
```

**Parameters:**
- `character_id` (path) - Character UUID or name

**Response**: Array of chat sessions for the character

**Example:**
```json
[
  {
    "chat_session_uuid": "session-123",
    "character_id": "elena",
    "created_at": "2025-12-26T10:00:00Z",
    "last_message_at": "2025-12-26T11:30:00Z",
    "message_count": 42
  }
]
```

---

### Load Chat Session

```http
POST /api/chat/load
```

**Request Body:**
```json
{
  "chat_session_uuid": "session-123"
}
```

**Response**: Complete chat history with messages

**Example:**
```json
{
  "chat_session_uuid": "session-123",
  "character_id": "elena",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "timestamp": "2025-12-26T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Greetings, traveler!",
      "timestamp": "2025-12-26T10:00:05Z"
    }
  ],
  "session_notes": "Elena is on a quest to find the ancient sword",
  "compression_enabled": true
}
```

---

### Create New Chat Session

```http
POST /api/chat/create-new-chat
```

**Request Body:**
```json
{
  "character_id": "elena",
  "session_notes": "Starting a new adventure"
}
```

**Response**: New chat session UUID

---

### Append Chat Message

```http
POST /api/chat/append-chat-message
```

**Request Body:**
```json
{
  "chat_session_uuid": "session-123",
  "role": "user",
  "content": "What should we do next?"
}
```

**Response**: Success confirmation

---

### Load Latest Chat

```http
GET /api/chat/load-latest-chat/{character_id}
```

**Parameters:**
- `character_id` (path) - Character UUID or name

**Response**: Most recent chat session for the character

---

## Settings API

Base path: `/api/settings/`

Manages application configuration.

### Get Settings

```http
GET /api/settings/
```

**Response**: Current application settings

**Example:**
```json
{
  "api": {
    "default_provider": "openai",
    "openai_api_key": "sk-...",
    "default_model": "gpt-4"
  },
  "ui": {
    "theme": "dark",
    "font_size": "medium"
  },
  "paths": {
    "characters_dir": "characters/",
    "worlds_dir": "worlds/",
    "chats_dir": "chats/"
  }
}
```

---

### Update Settings

```http
POST /api/settings/
```

**Request Body**: Settings object (partial updates supported)

**Example:**
```json
{
  "api": {
    "default_provider": "anthropic",
    "anthropic_api_key": "sk-ant-..."
  }
}
```

**Response**: Updated settings

---

## Templates API

Base path: `/api/templates/`

Manages chat prompt templates.

### List Templates

```http
GET /api/templates/
```

**Response**: Array of available templates

**Example:**
```json
[
  {
    "name": "default",
    "description": "Standard chat template",
    "file_path": "templates/default.json"
  },
  {
    "name": "roleplay",
    "description": "Immersive roleplay template",
    "file_path": "templates/roleplay.json"
  }
]
```

---

### Get Template

```http
GET /api/templates/{template_name}
```

**Parameters:**
- `template_name` (path) - Name of the template

**Response**: Template content

**Example:**
```json
{
  "name": "default",
  "system_prompt": "You are a helpful assistant",
  "user_prefix": "User: ",
  "assistant_prefix": "Assistant: ",
  "format": "{{system_prompt}}\n\n{{history}}\n\n{{user_prefix}}{{message}}\n{{assistant_prefix}}"
}
```

---

### Create/Update Template

```http
POST /api/templates/
```

**Request Body**: Template object

**Response**: Saved template confirmation

---

### Delete Template

```http
DELETE /api/templates/{template_name}
```

**Parameters:**
- `template_name` (path) - Name of the template to delete

**Response**: Success confirmation

---

## Content Filters API

Base path: `/api/content-filters/`

Manages content moderation filters.

### List Filters

```http
GET /api/content-filters/
```

**Response**: Array of available content filters (builtin and custom)

---

### Get Filter

```http
GET /api/content-filters/{filter_name}
```

**Parameters:**
- `filter_name` (path) - Name of the filter

**Response**: Filter configuration and rules

---

### Create/Update Custom Filter

```http
POST /api/content-filters/
```

**Request Body**: Filter configuration

**Response**: Saved filter confirmation

---

### Delete Custom Filter

```http
DELETE /api/content-filters/{filter_name}
```

**Parameters:**
- `filter_name` (path) - Name of custom filter to delete (builtin filters cannot be deleted)

**Response**: Success confirmation

---

## Background API

Base path: `/api/backgrounds/`

Manages background images for chat customization.

### List Backgrounds

```http
GET /api/backgrounds/
```

**Response**: Array of available backgrounds with metadata

---

### Upload Background

```http
POST /api/backgrounds/upload
```

**Request**: Multipart form data with image file and metadata

**Response**: Uploaded background information

---

### Delete Background

```http
DELETE /api/backgrounds/{background_name}
```

**Parameters:**
- `background_name` (path) - Name of background to delete

**Response**: Success confirmation

---

## Rooms API

Base path: `/api/rooms/`

Manages chat rooms and conversation spaces.

### List Rooms

```http
GET /api/rooms/
```

**Response**: Array of available rooms

---

### Create Room

```http
POST /api/rooms/
```

**Request Body**: Room configuration

**Response**: Created room object

---

### Update Room

```http
PUT /api/rooms/{room_id}
```

**Parameters:**
- `room_id` (path) - Room identifier

**Request Body**: Updated room configuration

**Response**: Updated room object

---

### Delete Room

```http
DELETE /api/rooms/{room_id}
```

**Parameters:**
- `room_id` (path) - Room identifier

**Response**: Success confirmation

---

## Error Responses

All endpoints follow consistent error response formats:

### Standard Error Response

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "status_code": 400
}
```

### Common HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `404 Not Found` - Resource not found
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

### Example Error Response

```json
{
  "error": "ValidationError",
  "message": "character_uuid is required in metadata",
  "status_code": 422,
  "details": {
    "field": "character_uuid",
    "constraint": "required"
  }
}
```

---

## Request/Response Conventions

### Content Types

- **JSON requests**: `Content-Type: application/json`
- **File uploads**: `Content-Type: multipart/form-data`
- **SSE responses**: `Content-Type: text/event-stream`

### Authentication

Currently, CardShark is designed for local use and does not require authentication. API keys for AI providers are stored in settings and used server-side.

### CORS

CORS is configured to allow requests from the frontend during development:
- Development frontend: `http://localhost:6969`
- Production: Served from the same origin as the backend

---

## Additional Resources

- **[Development Guide](DEVELOPMENT.md)** - Setup and testing
- **[Code Conventions](../.kiro/steering/conventions.md)** - Backend patterns and standards
- **[Project Structure](../.kiro/steering/structure.md)** - Backend file organization
- **[Persistence Architecture](persistence_architecture.md)** - Data storage patterns

---

For questions or issues, join the [CardShark Discord](https://discord.gg/RfVts3hYsd).
