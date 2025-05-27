# CardShark User Flows

## Table of Contents
1. [Introduction](#introduction)
2. [Core Terms](#core-terms)
3. [User Flows](#user-flows)
   - [Character Card Flows](#character-card-flows)
   - [Chat Flows](#chat-flows)
   - [World Card Flows](#world-card-flows)
   - [API Configuration Flows](#api-configuration-flows)
   - [Template Management Flows](#template-management-flows)
   - [User Profile Flows](#user-profile-flows)
4. [Implementation Notes](#implementation-notes)

## Introduction

This document outlines the key user flows and interactions within the CardShark application. It defines core terminology and maps out the primary pathways users take when interacting with characters, worlds, and system settings.

## Core Terms

| Term | Definition |
|------|------------|
| Character | JSONified metadata embedded in the `char` exif field in a very specific `v2` format that is designed to be compatible with other applications of this type. These are sometimes referred to as "Character Cards," hence the name CardShark. |
| API | Combination of API URL and usually an API key that enables communication either within the local machine or on the internet. |
| Chat | The interaction between {{user}} and {{char}} is a written exchange. With SQLite persistence, each continuous conversation is a "chat session" identified by a `chat_session_uuid`. Messages are sent via API (e.g., `/api/append-chat-message`, `/api/chat/generate`) to an LLM for response. `Chats` now refers to these persistent sessions stored in the database. |
| User | {{user}} is the human player interacting with CardShark, but may also be represented by a JSONified metadata embedded `char` PNG file just like {{char}}, except {{user}} is only ever loaded/chosen using UserSelect in the Chat and WorldCardPlay views. |
| World | A world is a world_state.json containing relationships between a grid of "rooms" (often referred to as "locations"), NPCs, per-room metadata (Introduction/Description/Name/etc), and dynamic content like "events." |
| NPC | When a {{char}} is loaded as contained within a World Card's "Location" or "Room", it is referred to as an NPC. For our purposes, {{char}}/Character and an NPC are the same thing presenting in two different contexts. |
| Room | A room or a "Location" is a grid segment of a World that represents a different physical location for the purposes of play, with different NPCs present, different dangers, and a different introductory paragraph (Introduction) that establishes play in that location. A room may be a location in a town, a separate room of a building, or any other sub-section or sub-zone of a World. |
| Lore | A lore item is a package of metadata designed to be dynamically injected into context during a Chat if certain keywords are matched. If a user adds a lore item that says "smile" with content of "{{Char}} can't stop smiling!" the intention is that any time we see the word "smile" (but no more than once per 3 messages) we will inject the content resulting in the {{char}} getting the hint that they should smile. Lore is stored in the v2 format as `character_book` - which is an array of `entries`. |
| Map | The grid of interlocking rooms/locations associated with a World. |
| Messages | While generically referring to all inbound and outbound chat interactions, there are two special versions of messages. The First Message or "first_mes" introduces the {{character}} and establishes the foundation of the roleplay interaction. Alternative Greetings or "alt_greetings" [array] can be easily chosen as the desired "first_mes" by choosing to activate them in the Message Manager. |
| Template | Chat completion templates are necessary for formatting outbound and decoding inbound messages via the API. Different LLM architectures use different [stopTokens] and payload formatting. The current template for a given API is in its APIConfigurationPanel, entirely chosen by the user. |

## User Flows

### Character Card Flows

#### 1. Load a Character
1. **Load from File**
   - User clicks "Load PNG" in the sidebar
   - System reads PNG metadata from the `chara` field
   - Character Info View is populated with the character data
   
2. **Load from Gallery**
   - User configures a Character Directory via Settings / General
   - User navigates to the Character Gallery View
   - User clicks on a character card to load it
   
3. **Load from World**
   - User navigates to a room in a World where an NPC is assigned
   - User clicks on the NPC icon
   - User selects a character option to load and interact with the character

#### 2. Save a Character
1. User makes changes to character information
2. User clicks the save icon in the sidebar
3. System commits changes and writes metadata to the `chara` field of the PNG file

#### 3. Create a Character
1. User navigates to Character Creation View
2. User fills out character details (name, description, personality, etc.)
3. User sets a first message and alternative greetings
4. User uploads or selects an avatar image
5. User clicks the save icon to create the character card

#### 4. Modify a Character
1. User loads a character (see Load a Character)
2. User edits information in one of the following views:
   - Character Info View (basic details)
   - Message Manager (first_mes and alt_greetings)
   - Lore Manager (character_book entries)
3. User saves the changes (see Save a Character)

### Chat Flows

#### 1. Start a New Chat
1. User loads a character (or enters Assistant Mode).
2. User clicks "Chat" in side navigation or a "New Chat" button.
3. Frontend calls `POST /api/create-new-chat` (optionally with `character_id`).
4. Backend creates a new chat session in SQLite, generates a `chat_session_uuid`, and returns it.
5. Frontend stores the `chat_session_uuid`.
6. System displays ChatView. If a character is loaded and has a `first_mes`, it might be displayed (or sent as the first "assistant" message via API).
7. User can type and send messages.

#### 2. Continue a Chat
1. User loads a character (or intends to continue an Assistant Mode chat).
2. Frontend calls `POST /api/load-latest-chat` (with `character_id` if applicable, or a stored `chat_session_uuid` for a specific session).
3. Backend retrieves the chat session (identified by `chat_session_uuid`) and its messages from SQLite.
4. System loads the chat history into ChatView.
5. User continues the conversation. The frontend includes the `chat_session_uuid` in all subsequent chat-related API calls for this session.

#### 3. Chat Interaction (with `chat_session_uuid`)
1. User types a message in ChatView.
2. Frontend sends the message via `POST /api/append-chat-message`, including the active `chat_session_uuid` and the message content (role: "user").
3. Backend service ([`backend/services/chat_service.py`](backend/services/chat_service.py:0)) saves the user's message to the database, associated with the `chat_session_uuid`.
4. For generating a response, frontend calls `POST /api/chat/generate`, including the `chat_session_uuid`.
5. Backend service retrieves necessary context (character details, chat history from DB using `chat_session_uuid`), calls the LLM, and saves the assistant's response to the database, associated with the `chat_session_uuid`.
6. The assistant's response is sent back to the frontend and displayed.
7. The `/api/save-chat` endpoint can be used for explicit save points if needed, though individual messages are persisted.

### World Card Flows

#### 1. Create a World
1. User navigates to World Builder View
2. User configures basic world settings (name, description)
3. User creates a grid of rooms/locations
4. User adds NPCs to rooms
5. User sets room descriptions and properties
6. User saves the World Card

#### 2. Load a World
1. User clicks "Load World" in the sidebar
2. User selects a World Card to load
3. System reads the world_state.json and configures the World Builder View

#### 3. Play in a World
1. User loads a World Card
2. User navigates to World Play View
3. User selects a starting room
4. User can interact with NPCs or move between rooms

### API Configuration Flows

#### 1. Configure an API
1. User navigates to Settings / API Configuration
2. User enters API endpoint details (URL, key, etc.)
3. User selects or creates a template for the API
4. User saves the configuration

#### 2. Test an API
1. User configures an API
2. User clicks "Test Connection"
3. System sends a test request and reports the result

### Template Management Flows

#### 1. Create a Template
1. User navigates to Template Manager
2. User clicks "New Template"
3. User configures template settings (name, format, stopTokens)
4. User saves the template

#### 2. Modify a Template
1. User navigates to Template Manager
2. User selects an existing template
3. User makes changes to template settings
4. User saves the updated template

### User Profile Flows

#### 1. Create a User Profile
1. User navigates to User Profile Manager
2. User creates a new profile with name and optional avatar
3. User saves the profile

#### 2. Select Active User
1. User clicks User Select in Chat or World Play View
2. User selects a profile from the available options
3. System sets the selected profile as {{currentUserSelected}}

## Implementation Notes

### Combined Save Functionality (Potential UI Enhancement)
Consideration for future UI development: We currently have separate "Save Character" and "Save World" buttons. A unified save button in the sidebar could be explored, potentially with a toggle in views to switch context between "Character" and "World" modes, as a World and a Character are not likely to be simultaneously selected for saving.

### Chat Message Processing & Persistence
- Chat messages are now associated with a `chat_session_uuid` in the SQLite database.
- The frontend sends the `chat_session_uuid` with API requests like `/api/append-chat-message` and `/api/chat/generate`.
- The backend ([`backend/services/chat_service.py`](backend/services/chat_service.py:0)) uses this UUID to retrieve context, store new messages, and manage chat history.
- Placeholders like `{{char}}` and `{{user}}` are resolved by the backend or frontend as needed, but the core data linkage is through `chat_session_uuid` and `character_id` in the database.

### Character/World Data Management
- Character data (including `character_uuid`) remains in PNG metadata.
- Chat data is now separate, stored in the SQLite database (`cardshark.sqlite`) and linked to characters via `character_id` within the chat session records.
- World data remains in `world_state.json` and associated files.

