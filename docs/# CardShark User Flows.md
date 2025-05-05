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
| Chat | The interaction between {{user}} and {{char}} is a written exchange back and forth with {{user}}'s messages being delivered via API to the local or web-based LLM for processing and response generation. `Chats` refers to the collection of multiple game instances between {{user}} and that specific {{char}}. |
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
1. User loads a character
2. User clicks "Chat" in the side navigation
3. System displays ChatView with the character's first_mes
4. User can type and send messages to interact with the character

#### 2. Continue a Chat
1. User loads a character
2. User clicks "Load Chat" to view historical chats
3. User selects a specific chat from the history
4. System loads the selected chat history
5. User continues the conversation from where it left off

#### 3. Chat Interaction
1. User types a message and sends it
2. Message is marked as "user" and sent to the API
3. System processes response through the current API
4. Response is marked as "assistant" and displayed in the chat
5. Additional context may be injected as "system" messages when appropriate

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

### Combined Save Functionality
We currently have separate "Save Character" and "Save World" buttons, but it makes more sense to use a unified save button in the sidebar since a World and a Character are not likely to be simultaneously selected. This suggests incorporating World Cards into our existing views with a toggle between "Character" and "World" modes.

### Chat Message Processing
Chat substitutes {{char}} for {{characterdata.name}} and {{user}} for {{currentUserSelected}}. Messages are processed through the current API configuration with appropriate template formatting.

### Character/World Integration
A potential enhancement would be storing a boolean in the PNG metadata to indicate whether a card is a Character or World, allowing the system to load the appropriate view (Character Info or World Builder) based on this flag.

