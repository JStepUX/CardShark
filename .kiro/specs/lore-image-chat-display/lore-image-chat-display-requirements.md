# Requirements Document

## Introduction

This feature enhances CardShark's existing lore system by automatically displaying images in the chat view when lore entries with associated images are triggered by keyword matches. Currently, the lore system can match keywords and inject text content into prompts, and lore entries can have associated images stored in the system. However, these images are not displayed in the chat interface when their corresponding lore entries are activated. This feature bridges that gap by leveraging the existing TipTap MarkdownImage extension to seamlessly display lore images within chat conversations.

## Requirements

### Requirement 1

**User Story:** As a user chatting with a character, I want to see relevant lore images automatically appear in the chat when I mention keywords that trigger lore entries with images, so that I can have a more immersive visual storytelling experience.

#### Acceptance Criteria

1. WHEN a user sends a message containing keywords that match a lore entry with an associated image THEN the system SHALL automatically inject the lore image into the chat response
2. WHEN multiple lore entries with images are triggered by a single message THEN the system SHALL display all relevant images in the appropriate positions based on lore entry insertion order
3. WHEN a lore entry is triggered but has no associated image THEN the system SHALL continue to function normally without displaying any image
4. WHEN lore images are displayed in chat THEN they SHALL be rendered using the existing TipTap image display functionality with proper styling and zoom capabilities

### Requirement 2

**User Story:** As a user, I want lore images to appear in contextually appropriate positions within the chat response, so that the visual elements enhance rather than disrupt the conversation flow.

#### Acceptance Criteria

1. WHEN a lore entry with position "before_char" has an image THEN the image SHALL be displayed before the character description in the response
2. WHEN a lore entry with position "after_char" has an image THEN the image SHALL be displayed after the character description in the response
3. WHEN a lore entry with position "an_top" has an image THEN the image SHALL be displayed at the top of the author's note section
4. WHEN a lore entry with position "an_bottom" has an image THEN the image SHALL be displayed at the bottom of the author's note section
5. WHEN multiple images are assigned to the same position THEN they SHALL be displayed in insertion order

### Requirement 3

**User Story:** As a user, I want the lore image display to work seamlessly with the existing chat system, so that I don't experience any performance degradation or visual inconsistencies.

#### Acceptance Criteria

1. WHEN lore images are injected into chat responses THEN the system SHALL maintain the same response time performance as text-only lore entries
2. WHEN lore images are displayed THEN they SHALL use the existing image URL structure `/uploads/lore_images/{character_uuid}/{image_uuid}`
3. WHEN lore images fail to load THEN the system SHALL gracefully handle the error without breaking the chat interface
4. WHEN lore images are displayed THEN they SHALL respect the existing TipTap editor styling and responsive design

### Requirement 4

**User Story:** As a user, I want to be able to control when lore images appear in chat, so that I can customize my experience based on my preferences.

#### Acceptance Criteria

1. WHEN a lore entry is disabled THEN its associated image SHALL NOT be displayed in chat even if keywords are matched
2. WHEN a character has no lore entries with images THEN the chat system SHALL function normally without any image processing overhead
3. WHEN lore image display is active THEN it SHALL work consistently across all AI providers (OpenAI, Claude, KoboldCPP)
4. WHEN viewing chat history THEN previously displayed lore images SHALL remain visible and properly formatted

### Requirement 5

**User Story:** As a developer, I want the lore image display system to integrate cleanly with the existing codebase, so that it's maintainable and doesn't introduce technical debt.

#### Acceptance Criteria

1. WHEN implementing lore image display THEN the system SHALL reuse the existing `LoreHandler` class and extend its functionality
2. WHEN processing lore images THEN the system SHALL use the existing database models (`LoreImage`, `LoreEntry`) without modifications
3. WHEN injecting images into chat THEN the system SHALL use markdown syntax that the existing `MarkdownImage` TipTap extension can process
4. WHEN handling image URLs THEN the system SHALL use the existing image serving infrastructure without requiring new endpoints
5. WHEN errors occur during image processing THEN the system SHALL log appropriate messages using the existing logging system