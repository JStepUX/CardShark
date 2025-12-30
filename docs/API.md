# API.md

## BASE_CONFIG
```yaml
development: http://localhost:9696
production: depends_on_deployment
cors_dev: http://localhost:6969
auth: none (local use only)
```

## WORLD_CARDS_API_V2
```yaml
base_path: /api/world-cards-v2/
note: PNG-based world cards using Character Card V2 spec

list_worlds:
  method: GET
  path: /api/world-cards-v2/
  response: array[WorldCardSummary]

create_world:
  method: POST
  path: /api/world-cards-v2/
  content_type: multipart/form-data
  fields:
    name: string (required)
    description: string
    grid_width: int (default 10)
    grid_height: int (default 10)
    first_mes: string
    system_prompt: string
    image: PNG file
  response: WorldCardSummary
  side_effect: creates PNG in characters/worlds/

get_world:
  method: GET
  path: /api/world-cards-v2/{uuid}
  params:
    uuid: path (world UUID)
  response: WorldCard (Character Card V2 + world_data extension)

update_world:
  method: PUT
  path: /api/world-cards-v2/{uuid}
  params:
    uuid: path (world UUID)
  body:
    player_position: {x: int, y: int}
    rooms: array[{room_uuid: string, grid_position: {x: int, y: int}}]
  response: WorldCardSummary

delete_world:
  method: DELETE
  path: /api/world-cards-v2/{uuid}
  params:
    uuid: path (world UUID)
  side_effect: deletes PNG from characters/worlds/

export_world:
  method: GET
  path: /api/world-cards-v2/{uuid}/export
  params:
    uuid: path (world UUID)
  response: .cardshark.zip archive (world.png + rooms/*.png + characters/*.png)

import_world:
  method: POST
  path: /api/world-cards-v2/import
  content_type: multipart/form-data
  fields:
    file: .cardshark.zip archive
  response: {world: {uuid, name, description}, message}
  side_effect: [regenerates UUIDs, updates references, saves to characters/worlds/]
```

## ROOM_CARDS_API_V2
```yaml
base_path: /api/room-cards-v2/
note: PNG-based room cards using Character Card V2 spec

list_rooms:
  method: GET
  path: /api/room-cards-v2/
  response: array[RoomCardSummary]

create_room:
  method: POST
  path: /api/room-cards-v2/
  content_type: multipart/form-data
  fields:
    name: string (required)
    description: string
    first_mes: string (introduction_text)
    npcs: JSON array[{character_uuid, role, hostile}]
    image: PNG file
  response: RoomCardSummary
  side_effect: [validates NPC UUIDs, creates PNG in characters/rooms/]

get_room:
  method: GET
  path: /api/room-cards-v2/{uuid}
  params:
    uuid: path (room UUID)
  response: RoomCard (Character Card V2 + room_data extension)

update_room:
  method: PUT
  path: /api/room-cards-v2/{uuid}
  params:
    uuid: path (room UUID)
  body:
    name: string
    description: string
    first_mes: string
    npcs: array[{character_uuid, role, hostile}]
  response: RoomCardSummary

delete_room:
  method: DELETE
  path: /api/room-cards-v2/{uuid}
  params:
    uuid: path (room UUID)
  side_effect: deletes PNG from characters/rooms/
```

## CHARACTERS_API
```yaml
base_path: /api/characters/

list_characters:
  method: GET
  path: /api/characters/
  response:
    - character_uuid: string
      name: string
      description: string
      file_path: string

save_card:
  method: POST
  path: /api/characters/save-card
  content_type: multipart/form-data
  fields:
    file: PNG
    metadata: JSON_string
  metadata_fields:
    character_uuid: string (required)
    name: string
    description: string
    personality: string
    first_message: string
  side_effect: embeds_metadata_in_PNG_EXIF

extract_metadata:
  method: POST
  path: /api/characters/extract-metadata
  content_type: multipart/form-data
  fields:
    file: PNG
  response: extracted_v2_metadata

get_by_id:
  method: GET
  path: /api/characters/{character_id}
  params:
    character_id: path (UUID or name)
  response: full_character_object
```

## CHAT_API
```yaml
base_path: /api/chat/

generate:
  method: POST
  path: /api/chat/generate
  body:
    chat_session_uuid: string (REQUIRED)
    character_id: string
    message: string
    api_config:
      provider: string
      model: string
      temperature: number
  response_type: text/event-stream (SSE)
  sse_format:
    - token: string
      done: boolean
  side_effect: appends_to_SQLite

list_sessions:
  method: GET
  path: /api/chat/list/{character_id}
  params:
    character_id: path
  response:
    - chat_session_uuid: string
      character_id: string
      created_at: ISO8601
      last_message_at: ISO8601
      message_count: integer

load_session:
  method: POST
  path: /api/chat/load
  body:
    chat_session_uuid: string
  response:
    chat_session_uuid: string
    character_id: string
    messages: array
    session_notes: string
    compression_enabled: boolean

create_new_chat:
  method: POST
  path: /api/chat/create-new-chat
  body:
    character_id: string|null
    session_notes: string
  response:
    chat_session_uuid: string
  side_effect: creates_SQLite_row

append_message:
  method: POST
  path: /api/chat/append-chat-message
  body:
    chat_session_uuid: string (REQUIRED)
    role: user|assistant
    content: string
  response:
    success: boolean
  side_effect: appends_to_SQLite

load_latest:
  method: GET
  path: /api/chat/load-latest-chat/{character_id}
  params:
    character_id: path
  response: most_recent_session_for_character
```

## SETTINGS_API
```yaml
base_path: /api/settings/

get_settings:
  method: GET
  path: /api/settings/
  response:
    api:
      default_provider: string
      openai_api_key: string
      default_model: string
    ui:
      theme: string
      font_size: string
    paths:
      characters_dir: string
      worlds_dir: string
      chats_dir: string

update_settings:
  method: POST
  path: /api/settings/
  body: partial_or_full_settings_object
  response: updated_settings
  side_effect: writes_to_settings_json
```

## TEMPLATES_API
```yaml
base_path: /api/templates/

list_templates:
  method: GET
  path: /api/templates/
  response:
    - name: string
      description: string
      file_path: string

get_template:
  method: GET
  path: /api/templates/{template_name}
  params:
    template_name: path
  response:
    name: string
    system_prompt: string
    user_prefix: string
    assistant_prefix: string
    format: string

save_template:
  method: POST
  path: /api/templates/
  body: template_object
  response: success_confirmation

delete_template:
  method: DELETE
  path: /api/templates/{template_name}
  params:
    template_name: path
  response: success_confirmation
```

## CONTENT_FILTERS_API
```yaml
base_path: /api/content-filters/

list_filters:
  method: GET
  path: /api/content-filters/
  response: array[builtin_and_custom_filters]

get_filter:
  method: GET
  path: /api/content-filters/{filter_name}
  params:
    filter_name: path
  response: filter_configuration_and_rules

save_custom_filter:
  method: POST
  path: /api/content-filters/
  body: filter_configuration
  response: success_confirmation

delete_custom_filter:
  method: DELETE
  path: /api/content-filters/{filter_name}
  params:
    filter_name: path
  constraint: builtin_filters_cannot_be_deleted
  response: success_confirmation
```

## BACKGROUNDS_API
```yaml
base_path: /api/backgrounds/

list_backgrounds:
  method: GET
  path: /api/backgrounds/
  response: array[background_with_metadata]

upload_background:
  method: POST
  path: /api/backgrounds/upload
  content_type: multipart/form-data
  fields:
    file: image
    metadata: JSON
  response: uploaded_background_info

delete_background:
  method: DELETE
  path: /api/backgrounds/{background_name}
  params:
    background_name: path
  response: success_confirmation
```

## ROOMS_API
```yaml
base_path: /api/rooms/

list_rooms:
  method: GET
  path: /api/rooms/
  response: array[room_objects]

create_room:
  method: POST
  path: /api/rooms/
  body: room_configuration
  response: created_room_object

update_room:
  method: PUT
  path: /api/rooms/{room_id}
  params:
    room_id: path
  body: updated_room_configuration
  response: updated_room_object

delete_room:
  method: DELETE
  path: /api/rooms/{room_id}
  params:
    room_id: path
  response: success_confirmation
```

## ERROR_RESPONSES
```yaml
format:
  error: string (error_type)
  message: string (detail)
  status_code: integer
  details: object (optional)

status_codes:
  200: OK
  201: Created
  400: Bad Request
  404: Not Found
  422: Unprocessable Entity (validation)
  500: Internal Server Error

example:
  error: ValidationError
  message: "character_uuid is required in metadata"
  status_code: 422
  details:
    field: character_uuid
    constraint: required
```

## CONVENTIONS
```yaml
content_types:
  json_request: application/json
  file_upload: multipart/form-data
  sse_response: text/event-stream

invariants:
  chat_session_uuid: required for all chat ops post-creation
  character_uuid: immutable, embedded in PNG EXIF

cors:
  dev_origin: http://localhost:6969
  prod_origin: same_as_backend
```

## REFS
```yaml
context: ../CONTEXT.md (API_CONTRACTS section)
development: DEVELOPMENT.md
structure: ../.kiro/steering/structure.md
conventions: ../.kiro/steering/conventions.md
```
