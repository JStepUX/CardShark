# CardShark Playwright Test Flows

## Overview

This document outlines comprehensive Playwright test flows for the CardShark application. It covers all major user interactions and serves as a reference for consistent automated testing of the application's core functionality.

## Prerequisites

### Setup Requirements
1. **Server Running**: Ensure CardShark backend is running on `http://localhost:8000`
2. **Frontend Running**: Ensure frontend is running on `http://localhost:6969`
3. **Test Data**: Have sample PNG character cards available in the `characters/` directory
4. **API Configuration**: Ensure at least one API provider is configured (KoboldCPP, OpenAI, etc.)

### Playwright Installation
```bash
npm install -D @playwright/test
npx playwright install
```

## Core Test Flows

### 1. Character Management Flows

#### 1.1 Load Character from PNG File
```javascript
// Test: Load character from PNG file upload
test('Load character from PNG file', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to character loading
  await page.click('[data-testid="load-png-button"]');
  
  // Upload PNG file with character metadata
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('characters/Elizabeth.png');
  
  // Verify character data is loaded
  await expect(page.locator('[data-testid="character-name"]')).toContainText('Elizabeth');
  await expect(page.locator('[data-testid="character-description"]')).toBeVisible();
  
  // Verify PNG metadata extraction
  await expect(page.locator('[data-testid="character-personality"]')).toBeVisible();
  await expect(page.locator('[data-testid="character-scenario"]')).toBeVisible();
});
```

#### 1.2 Character Gallery Navigation and Selection
```javascript
// Test: Navigate Character Gallery and select character
test('Character Gallery navigation and smooth scrolling', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to Character Gallery
  await page.click('[data-testid="character-gallery-nav"]');
  
  // Verify gallery loads
  await expect(page.locator('[data-testid="character-gallery"]')).toBeVisible();
  
  // Test smooth scrolling behavior
  await page.evaluate(() => {
    window.scrollTo({ top: 500, behavior: 'smooth' });
  });
  
  // Wait for scroll to complete
  await page.waitForTimeout(1000);
  
  // Select a character card
  await page.click('[data-testid="character-card"]:first-child');
  
  // Verify character loads
  await expect(page.locator('[data-testid="character-info-view"]')).toBeVisible();
  
  // Verify character data populates
  await expect(page.locator('[data-testid="character-name"]')).not.toBeEmpty();
});
```

#### 1.3 Character Data Modification and Saving
```javascript
// Test: Modify character data and save
test('Modify character data and save', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Load a character first
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/Elizabeth.png');
  
  // Navigate to character info view
  await page.click('[data-testid="character-info-tab"]');
  
  // Modify character name
  const nameField = page.locator('[data-testid="character-name-input"]');
  await nameField.clear();
  await nameField.fill('Elizabeth Modified');
  
  // Modify description
  const descField = page.locator('[data-testid="character-description-input"]');
  await descField.clear();
  await descField.fill('Modified description for testing');
  
  // Save character
  await page.click('[data-testid="save-character-button"]');
  
  // Verify save success notification
  await expect(page.locator('[data-testid="save-success-toast"]')).toBeVisible();
  
  // Verify changes persist
  await expect(nameField).toHaveValue('Elizabeth Modified');
  await expect(descField).toHaveValue('Modified description for testing');
});
```

### 2. Chat System Flows

#### 2.1 Start New Chat with Character
```javascript
// Test: Start new chat with loaded character
test('Start new chat with character', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Load character
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/Elizabeth.png');
  
  // Navigate to chat
  await page.click('[data-testid="chat-nav"]');
  
  // Verify user selection dialog appears
  await expect(page.locator('[data-testid="user-select-dialog"]')).toBeVisible();
  
  // Select or create user profile
  await page.click('[data-testid="default-user-option"]');
  
  // Verify chat session starts
  await expect(page.locator('[data-testid="chat-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  
  // Verify first message appears if character has one
  const firstMessage = page.locator('[data-testid="chat-message"]:first-child');
  if (await firstMessage.isVisible()) {
    await expect(firstMessage).toContainText('Elizabeth');
  }
});
```

#### 2.2 Send Message and Receive Response
```javascript
// Test: Send message and receive AI response
test('Send message and receive response', async ({ page }) => {
  // Setup: Load character and start chat (reuse previous setup)
  await setupCharacterChat(page);
  
  // Send a message
  const chatInput = page.locator('[data-testid="chat-input"]');
  await chatInput.fill('Hello, how are you today?');
  await page.click('[data-testid="send-message-button"]');
  
  // Verify user message appears
  await expect(page.locator('[data-testid="user-message"]').last()).toContainText('Hello, how are you today?');
  
  // Wait for AI response (with timeout)
  await expect(page.locator('[data-testid="assistant-message"]').last()).toBeVisible({ timeout: 30000 });
  
  // Verify response is not empty
  await expect(page.locator('[data-testid="assistant-message"]').last()).not.toBeEmpty();
  
  // Verify chat session UUID is maintained
  const chatSessionId = await page.evaluate(() => window.localStorage.getItem('current_chat_session_uuid'));
  expect(chatSessionId).toBeTruthy();
});
```

#### 2.3 Load Previous Chat Session
```javascript
// Test: Load previous chat session
test('Load previous chat session', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Load character
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/Elizabeth.png');
  
  // Navigate to chat
  await page.click('[data-testid="chat-nav"]');
  
  // Click load previous chat
  await page.click('[data-testid="load-previous-chat-button"]');
  
  // Verify chat selector dialog
  await expect(page.locator('[data-testid="chat-selector-dialog"]')).toBeVisible();
  
  // Select a previous chat
  await page.click('[data-testid="chat-option"]:first-child');
  
  // Verify chat history loads
  await expect(page.locator('[data-testid="chat-message"]')).toHaveCount.greaterThan(0);
  
  // Verify can continue conversation
  await expect(page.locator('[data-testid="chat-input"]')).toBeEnabled();
});
```

### 3. Lore Management Flows

#### 3.1 Extract and Populate Lore from PNG Metadata
```javascript
// Test: Lore extraction from PNG metadata
test('Extract lore from PNG metadata', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Load character with lore data
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/character_with_lore.png');
  
  // Navigate to Lore Manager
  await page.click('[data-testid="lore-manager-tab"]');
  
  // Verify lore entries are populated
  await expect(page.locator('[data-testid="lore-entry"]')).toHaveCount.greaterThan(0);
  
  // Verify lore entry structure
  const firstLoreEntry = page.locator('[data-testid="lore-entry"]:first-child');
  await expect(firstLoreEntry.locator('[data-testid="lore-keys"]')).toBeVisible();
  await expect(firstLoreEntry.locator('[data-testid="lore-content"]')).toBeVisible();
  
  // Test lore entry editing
  await firstLoreEntry.click();
  await expect(page.locator('[data-testid="lore-editor"]')).toBeVisible();
});
```

#### 3.2 Add and Manage Lore Entries
```javascript
// Test: Add new lore entry
test('Add and manage lore entries', async ({ page }) => {
  await setupCharacterWithLore(page);
  
  // Add new lore entry
  await page.click('[data-testid="add-lore-entry-button"]');
  
  // Fill lore details
  await page.locator('[data-testid="lore-keys-input"]').fill('magic, spells, wizard');
  await page.locator('[data-testid="lore-content-input"]').fill('{{char}} is skilled in magical arts and can cast powerful spells.');
  
  // Save lore entry
  await page.click('[data-testid="save-lore-entry-button"]');
  
  // Verify entry appears in list
  await expect(page.locator('[data-testid="lore-entry"]').last()).toContainText('magic, spells, wizard');
  
  // Test lore deletion
  await page.locator('[data-testid="lore-entry"]:last-child [data-testid="delete-lore-button"]').click();
  await page.click('[data-testid="confirm-delete-button"]');
  
  // Verify entry is removed
  await expect(page.locator('[data-testid="lore-entry"]')).not.toContainText('magic, spells, wizard');
});
```

### 4. TipTap Editor and Syntax Highlighting

#### 4.1 TipTap Editor Functionality
```javascript
// Test: TipTap editor with custom syntax highlighting
test('TipTap editor functionality and syntax highlighting', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to template editor or any view with TipTap
  await page.click('[data-testid="settings-nav"]');
  await page.click('[data-testid="template-settings-tab"]');
  
  // Locate TipTap editor
  const editor = page.locator('[data-testid="tiptap-editor"] .ProseMirror');
  await expect(editor).toBeVisible();
  
  // Test basic text input
  await editor.click();
  await editor.fill('Testing {{user}} and {{char}} syntax highlighting');
  
  // Verify syntax highlighting for template variables
  await expect(page.locator('.highlight-user')).toContainText('{{user}}');
  await expect(page.locator('.highlight-char')).toContainText('{{char}}');
  
  // Test formatting options
  await editor.selectText();
  await page.click('[data-testid="bold-button"]');
  await expect(editor.locator('strong')).toBeVisible();
  
  // Test custom highlighting settings
  await page.click('[data-testid="highlighting-settings-button"]');
  await expect(page.locator('[data-testid="highlighting-settings-panel"]')).toBeVisible();
});
```

### 5. Settings and API Configuration

#### 5.1 API Configuration and Template Linkage
```javascript
// Test: API configuration and template linkage
test('API configuration and template integration', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to API settings
  await page.click('[data-testid="settings-nav"]');
  await page.click('[data-testid="api-settings-tab"]');
  
  // Test API provider selection
  await page.click('[data-testid="api-provider-dropdown"]');
  await page.click('[data-testid="koboldcpp-option"]');
  
  // Configure API endpoint
  await page.locator('[data-testid="api-url-input"]').fill('http://localhost:5001');
  
  // Test template selection for this API
  await page.click('[data-testid="template-dropdown"]');
  await page.click('[data-testid="alpaca-template-option"]');
  
  // Save configuration
  await page.click('[data-testid="save-api-config-button"]');
  
  // Verify configuration persists
  await page.reload();
  await expect(page.locator('[data-testid="api-url-input"]')).toHaveValue('http://localhost:5001');
  
  // Test API connection
  await page.click('[data-testid="test-connection-button"]');
  await expect(page.locator('[data-testid="connection-status"]')).toContainText(/Connected|Success/);
});
```

#### 5.2 Template Management and Payload Configuration
```javascript
// Test: Template management and payload configuration
test('Template management and payload configuration', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to template settings
  await page.click('[data-testid="settings-nav"]');
  await page.click('[data-testid="template-settings-tab"]');
  
  // Create new template
  await page.click('[data-testid="create-template-button"]');
  
  // Fill template details
  await page.locator('[data-testid="template-name-input"]').fill('Test Template');
  await page.locator('[data-testid="template-format-input"]').fill('### Instruction:\n{{instruction}}\n\n### Response:\n');
  
  // Configure stop tokens
  await page.locator('[data-testid="stop-tokens-input"]').fill('###, <|endoftext|>');
  
  // Save template
  await page.click('[data-testid="save-template-button"]');
  
  // Verify template appears in list
  await expect(page.locator('[data-testid="template-list"]')).toContainText('Test Template');
  
  // Test template editing
  await page.click('[data-testid="edit-template-button"]');
  await expect(page.locator('[data-testid="template-editor"]')).toBeVisible();
  
  // Verify payload preview updates
  await expect(page.locator('[data-testid="payload-preview"]')).toContainText('### Instruction:');
});
```

### 6. World Cards and Room Navigation

#### 6.1 World Creation and Room Management
```javascript
// Test: World creation and room management
test('World creation and room management', async ({ page }) => {
  await page.goto('http://localhost:6969');
  
  // Navigate to Worlds
  await page.click('[data-testid="worlds-nav"]');
  
  // Create new world
  await page.click('[data-testid="create-world-button"]');
  
  // Fill world details
  await page.locator('[data-testid="world-name-input"]').fill('Test World');
  await page.locator('[data-testid="world-description-input"]').fill('A test world for Playwright testing');
  
  // Save world
  await page.click('[data-testid="save-world-button"]');
  
  // Enter world builder
  await page.click('[data-testid="edit-world-button"]');
  
  // Add rooms to the grid
  await page.click('[data-testid="grid-cell-0-0"]');
  await page.locator('[data-testid="room-name-input"]').fill('Starting Room');
  await page.locator('[data-testid="room-description-input"]').fill('The beginning of the adventure');
  await page.click('[data-testid="save-room-button"]');
  
  // Verify room appears on map
  await expect(page.locator('[data-testid="room-0-0"]')).toContainText('Starting Room');
});
```

#### 6.2 NPC Assignment and World Chat
```javascript
// Test: NPC assignment and world chat integration
test('NPC assignment and world chat', async ({ page }) => {
  await setupWorldWithRooms(page);
  
  // Assign NPC to room
  await page.click('[data-testid="room-0-0"]');
  await page.click('[data-testid="assign-npc-button"]');
  
  // Select character for NPC
  await page.click('[data-testid="character-selector"]');
  await page.click('[data-testid="character-option-elizabeth"]');
  await page.click('[data-testid="confirm-npc-assignment"]');
  
  // Enter play mode
  await page.click('[data-testid="play-world-button"]');
  
  // Navigate to room with NPC
  await page.click('[data-testid="room-0-0"]');
  
  // Interact with NPC
  await page.click('[data-testid="npc-elizabeth"]');
  
  // Verify chat starts with NPC context
  await expect(page.locator('[data-testid="chat-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="world-context-indicator"]')).toContainText('Starting Room');
  
  // Send message in world context
  await page.locator('[data-testid="chat-input"]').fill('Hello, what is this place?');
  await page.click('[data-testid="send-message-button"]');
  
  // Verify response includes world context
  await expect(page.locator('[data-testid="assistant-message"]').last()).toBeVisible({ timeout: 30000 });
});
```

### 7. Background and Visual Settings

#### 7.1 Background Selection and Chat Customization
```javascript
// Test: Background selection and chat customization
test('Background selection and chat customization', async ({ page }) => {
  await setupCharacterChat(page);
  
  // Open background settings
  await page.click('[data-testid="chat-settings-button"]');
  await page.click('[data-testid="background-settings-tab"]');
  
  // Select predefined background
  await page.click('[data-testid="background-option-forest"]');
  
  // Verify background applies
  await expect(page.locator('[data-testid="chat-background"]')).toHaveCSS('background-image', /forest/);
  
  // Test background positioning options
  await page.click('[data-testid="background-position-dropdown"]');
  await page.click('[data-testid="position-center"]');
  await expect(page.locator('[data-testid="chat-background"]')).toHaveCSS('background-position', 'center');
  
  // Test background scaling options
  await page.click('[data-testid="background-scale-dropdown"]');
  await page.click('[data-testid="scale-cover"]');
  await expect(page.locator('[data-testid="chat-background"]')).toHaveCSS('background-size', 'cover');
  
  // Test background opacity adjustment
  const opacitySlider = page.locator('[data-testid="background-opacity-slider"]');
  await opacitySlider.fill('0.7');
  await expect(page.locator('[data-testid="chat-background"]')).toHaveCSS('opacity', '0.7');
});
```

#### 7.2 Custom Background Upload and Management
```javascript
// Test: Custom background upload with validation
test('Custom background upload and validation', async ({ page }) => {
  await setupCharacterChat(page);
  
  // Open background settings
  await page.click('[data-testid="chat-settings-button"]');
  await page.click('[data-testid="background-settings-tab"]');
  
  // Test valid image upload
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles('test-assets/custom-background.jpg');
  
  // Verify upload success notification
  await expect(page.locator('[data-testid="upload-success-toast"]')).toBeVisible();
  
  // Verify custom background appears in gallery
  await expect(page.locator('[data-testid="custom-background-thumbnail"]')).toBeVisible();
  
  // Test invalid file type upload
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles('test-assets/invalid-file.txt');
  
  // Verify error message for invalid file
  await expect(page.locator('[data-testid="upload-error-toast"]')).toContainText('Invalid file type');
  
  // Test file size validation
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles('test-assets/large-background.jpg');
  
  // Verify file size warning if applicable
  const fileSizeWarning = page.locator('[data-testid="file-size-warning"]');
  if (await fileSizeWarning.isVisible()) {
    await expect(fileSizeWarning).toContainText('File size exceeds recommended limit');
  }
});
```

#### 7.3 Basic Image Cropping
```javascript
// Test: Basic image cropping functionality
test('Basic image cropping', async ({ page }) => {
  await setupCharacterChat(page);
  
  // Upload background for cropping
  await page.click('[data-testid="chat-settings-button"]');
  await page.click('[data-testid="background-settings-tab"]');
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles('test-assets/custom-background.jpg');
  
  // Open cropping interface
  await page.click('[data-testid="crop-background-button"]');
  await expect(page.locator('[data-testid="background-cropper"]')).toBeVisible();
  
  // Basic crop area adjustment
  const cropHandle = page.locator('[data-testid="crop-handle-bottom-right"]');
  await cropHandle.dragTo(page.locator('[data-testid="crop-target-position"]'));
  
  // Apply crop
  await page.click('[data-testid="apply-crop-button"]');
  
  // Verify cropper closes and background updates
  await expect(page.locator('[data-testid="background-cropper"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="chat-background"]')).toHaveAttribute('style', /background-image/);
});
```

#### 7.4 Background Gallery
```javascript
// Test: Basic background gallery functionality
test('Background gallery', async ({ page }) => {
  await setupCharacterChat(page);
  
  // Open background settings
  await page.click('[data-testid="chat-settings-button"]');
  await page.click('[data-testid="background-settings-tab"]');
  
  // Verify default backgrounds are available
  await expect(page.locator('[data-testid="default-backgrounds"]')).toBeVisible();
  await expect(page.locator('[data-testid="background-thumbnail"]')).toHaveCount.greaterThan(0);
  
  // Test selecting a background
  await page.click('[data-testid="background-thumbnail"]:first-child');
  await expect(page.locator('[data-testid="chat-background"]')).toHaveAttribute('style', /background-image/);
  
  // Test custom background upload
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles('test-assets/custom-background.jpg');
  
  // Verify upload appears
  await expect(page.locator('[data-testid="custom-background-thumbnail"]')).toBeVisible();
});
```

#### 7.5 Room Background Management
```javascript
// Test: Room-specific background settings in World Cards
test('Room background management', async ({ page }) => {
  await setupWorldWithRooms(page);
  
  // Select a room to configure
  await page.click('[data-testid="room-0-0"]');
  await page.click('[data-testid="room-settings-button"]');
  
  // Set room-specific background
  await page.click('[data-testid="room-background-tab"]');
  await page.click('[data-testid="background-thumbnail"]:first-child');
  
  // Save room configuration
  await page.click('[data-testid="save-room-button"]');
  
  // Verify room background in play mode
  await page.click('[data-testid="play-world-button"]');
  await page.click('[data-testid="room-0-0"]');
  
  await expect(page.locator('[data-testid="room-background"]')).toHaveAttribute('style', /background-image/);
});
```

#### 7.6 Room-Specific Background Management
```javascript
// Test: Room-specific background settings in World Cards
test('Room-specific background management', async ({ page }) => {
  await setupWorldWithRooms(page);
  
  // Create and configure a room
  await page.click('[data-testid="grid-cell-0-0"]');
  await page.locator('[data-testid="room-name-input"]').fill('Forest Clearing');
  await page.locator('[data-testid="room-description-input"]').fill('A peaceful forest clearing');
  
  // Set room-specific background
  await page.click('[data-testid="room-background-tab"]');
  await page.click('[data-testid="background-option-forest"]');
  
  // Test background positioning for room
  await page.click('[data-testid="background-position-dropdown"]');
  await page.click('[data-testid="position-top-center"]');
  
  // Test room background cropping
  await page.click('[data-testid="crop-room-background-button"]');
  await expect(page.locator('[data-testid="room-background-cropper"]')).toBeVisible();
  
  // Apply room-specific crop
  await page.click('[data-testid="apply-room-crop-button"]');
  
  // Save room configuration
  await page.click('[data-testid="save-room-button"]');
  
  // Verify room background in play mode
  await page.click('[data-testid="play-world-button"]');
  await page.click('[data-testid="room-0-0"]');
  
  await expect(page.locator('[data-testid="room-background"]')).toHaveCSS('background-image', /forest/);
  await expect(page.locator('[data-testid="room-background"]')).toHaveCSS('background-position', 'top center');
  
  // Test background inheritance settings
  await page.click('[data-testid="room-settings-button"]');
  await page.click('[data-testid="background-inheritance-checkbox"]');
  
  // Verify background inherits from world default
  await expect(page.locator('[data-testid="room-background"]')).toHaveCSS('background-image', /world-default/);
});
```

## Helper Functions

```javascript
// Helper function to setup character and start chat
async function setupCharacterChat(page) {
  await page.goto('http://localhost:6969');
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/Elizabeth.png');
  await page.click('[data-testid="chat-nav"]');
  await page.click('[data-testid="default-user-option"]');
  await expect(page.locator('[data-testid="chat-view"]')).toBeVisible();
}

// Helper function to setup character with lore
async function setupCharacterWithLore(page) {
  await page.goto('http://localhost:6969');
  await page.click('[data-testid="load-png-button"]');
  await page.locator('input[type="file"]').setInputFiles('characters/character_with_lore.png');
  await page.click('[data-testid="lore-manager-tab"]');
}

// Helper function to setup world with rooms
async function setupWorldWithRooms(page) {
  await page.goto('http://localhost:6969');
  await page.click('[data-testid="worlds-nav"]');
  await page.click('[data-testid="create-world-button"]');
  await page.locator('[data-testid="world-name-input"]').fill('Test World');
  await page.click('[data-testid="save-world-button"]');
  await page.click('[data-testid="edit-world-button"]');
}

// Helper function to setup background testing environment
async function setupBackgroundTesting(page) {
  await setupCharacterChat(page);
  await page.click('[data-testid="chat-settings-button"]');
  await page.click('[data-testid="background-settings-tab"]');
  await expect(page.locator('[data-testid="background-settings-panel"]')).toBeVisible();
}

// Helper function to upload and verify background
async function uploadAndVerifyBackground(page, filePath, expectedName = null) {
  await page.click('[data-testid="upload-background-button"]');
  await page.locator('input[type="file"]').setInputFiles(filePath);
  
  // Wait for upload to complete
  await expect(page.locator('[data-testid="upload-success-toast"]')).toBeVisible();
  
  // Verify thumbnail appears
  await expect(page.locator('[data-testid="custom-background-thumbnail"]').last()).toBeVisible();
  
  if (expectedName) {
    await expect(page.locator('[data-testid="background-name"]').last()).toContainText(expectedName);
  }
}

// Helper function to apply and verify background effects
async function applyBackgroundEffect(page, effectType, value, expectedCSSPattern) {
  const slider = page.locator(`[data-testid="${effectType}-effect-slider"]`);
  await slider.fill(value.toString());
  await expect(page.locator('[data-testid="chat-background"]')).toHaveCSS('filter', expectedCSSPattern);
}
```

## Test Data Requirements

### Required Test Assets
1. **Character PNG Files**:
   - `characters/Elizabeth.png` - Basic character with standard metadata
   - `characters/character_with_lore.png` - Character with lore entries in metadata
   - `characters/test_character.png` - Character for modification testing

2. **Background Images**:
   - `test-assets/custom-background.jpg` - For background upload testing
   - `test-assets/test-room-bg.png` - For room background testing
   - `test-assets/invalid-file.txt` - Invalid file type for error testing

3. **API Endpoints**:
   - Local KoboldCPP instance running on `http://localhost:5001`
   - Or configured API provider for response testing



## Test Execution Strategy

### Test Categories
1. **Smoke Tests**: Basic functionality verification
2. **Integration Tests**: Cross-component functionality
3. **E2E Tests**: Complete user workflows
4. **Visual Tests**: UI consistency and responsiveness

### Test Environment Setup
```bash
# Start backend
cd backend
python main.py

# Start frontend (in separate terminal)
cd frontend
npm run dev

# Run Playwright tests
npx playwright test
```

### Continuous Integration
- Tests should run on every PR
- Include visual regression testing
- Test against multiple browser engines (Chromium, Firefox, WebKit)
- Verify mobile responsiveness

## Troubleshooting Common Issues

1. **Chat Response Timeouts**: Increase timeout for AI response tests
2. **File Upload Failures**: Ensure test assets exist and are accessible
3. **API Connection Issues**: Verify backend is running and API endpoints are accessible
4. **Flaky Tests**: Add proper wait conditions and element visibility checks
5. **State Persistence**: Clear localStorage/sessionStorage between tests when needed
6. **Background Upload Issues**: Ensure test image files exist and are accessible
7. **Cropping Interface**: Add proper waits for cropper to load before interacting with elements
8. **CSS Verification**: Use attribute checks rather than specific CSS values when possible

## Future Enhancements

1. **Performance Testing**: Add tests for large character galleries and long chat sessions
2. **Accessibility Testing**: Include ARIA compliance and keyboard navigation tests
3. **Mobile Testing**: Comprehensive mobile device testing
4. **Load Testing**: Test application under concurrent user scenarios
5. **Security Testing**: Validate input sanitization and XSS prevention
6. **Enhanced Background Features**:
   - **Background Categories**: Test filtering and organization of background images
   - **Background Search**: Test search functionality within background gallery
   - **Performance Testing**: Monitor loading times with various image sizes

This document serves as the foundation for comprehensive Playwright testing of the CardShark application. Regular updates should be made as new features are added or existing functionality changes.