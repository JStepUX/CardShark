# CardShark Application Flow

## Primary Navigation & User Journey Map

```mermaid
flowchart TD
    Start([User Opens CardShark]) --> SideNav{Side Navigation}
    
    %% Main Navigation Branches
    SideNav --> Chat[Chat View]
    SideNav --> Worlds[Worlds View] 
    SideNav --> Settings[Settings View]
    SideNav --> CharGallery[Character Gallery]
      %% Chat Flow
    Chat --> HasChar{Character Selected?}
    HasChar -->|No| AssistantMode[Assistant Mode - Direct API Chat]
    HasChar -->|Yes| HasUser{User Profile Set?}
    AssistantMode --> HasUserAssistant{User Profile Set?}
    HasUserAssistant -->|No| UserSelectAssistant[User Select Dialog]
    HasUserAssistant -->|Yes| ChatActiveAssistant[Assistant Mode Chat]
    UserSelectAssistant --> ChatActiveAssistant
    
    %% Option to load character from Assistant Mode
    AssistantMode --> LoadChar[Load Character Card]
    LoadChar --> CharGallery
    CharGallery --> SelectChar[Select Character] --> Chat
      HasUser -->|No| UserSelect[User Select Dialog]
    HasUser -->|Yes| ChatActive[Character Chat Session]
    UserSelect --> ChatActive
    
    ChatActive --> ChatActions{User Actions}
    ChatActiveAssistant --> ChatActions
    ChatActions --> SendMsg[Send Message]
    ChatActions --> RegenerateMsg[Regenerate Response]
    ChatActions --> DeleteMsg[Delete Message]
    ChatActions --> LoadBg[Change Background]
    ChatActions --> LoadCharacterFromChat[Load Character Card]
    LoadCharacterFromChat --> CharGallery
    
    %% World Cards Flow
    Worlds --> WorldsList[Worlds List]
    WorldsList --> CreateWorld[Create New World]
    WorldsList --> EditWorld[Edit World]
    WorldsList --> PlayWorld[Play World]
    
    PlayWorld --> WorldPlay[WorldCardsPlayView]
    WorldPlay --> WorldActions{World Actions}
    WorldActions --> OpenMap[Open Map Dialog]
    WorldActions --> SelectNPC[Select NPC]
    WorldActions --> WorldChat[World Chat]
    
    OpenMap --> SelectRoom[Select Room] --> WorldChat
    SelectNPC --> NPCDialog[NPC Selection] --> WorldChat
    WorldChat --> ChatActive
    
    %% Settings Flow
    Settings --> SettingsTabs{Settings Tabs}
    SettingsTabs --> APISettings[API Configuration]
    SettingsTabs --> GeneralSettings[General Settings]
    SettingsTabs --> TemplateSettings[Template Management]
    SettingsTabs --> BackgroundSettings[Background Settings]
      %% Critical Decision Points
    style HasChar fill:#ff9999
    style HasUser fill:#ff9999
    style HasUserAssistant fill:#ff9999
    style WorldActions fill:#99ccff
    style ChatActions fill:#99ff99
    style AssistantMode fill:#ffff99
    
    %% Key Views
    style Chat fill:#ffcc99
    style WorldPlay fill:#ccffcc
    style Settings fill:#ffccff
    style ChatActiveAssistant fill:#ffffcc
```

## Critical User Decision Points

### 1. **Character Selection Gate** 🔑
```mermaid
flowchart LR
    A[Enter Chat] --> B{Character Loaded?}
    B -->|No| C[Assistant Mode Chat Without Character]
    B -->|Yes| D[Character-Based Chat]
    C --> E[Direct API Communication]
    C --> F[Option: Load Character Card]
    D --> G[Character Context + API]
    F --> H[Character Gallery]
    H --> D
```

### 2. **Assistant Mode vs Character Mode** 🤖
```mermaid
flowchart TD
    ChatStart[Chat Interface] --> Mode{Mode Type}
    
    Mode -->|Assistant Mode| AssistantFlow[Assistant Mode Flow]
    Mode -->|Character Mode| CharacterFlow[Character Mode Flow]
    
    AssistantFlow --> MinimalPayload[Minimal API Payload]
    MinimalPayload --> UserMessage[User Message Only]
    MinimalPayload --> SystemPrompt[Basic System Prompt]
    MinimalPayload --> APISettings[API Settings & Template]
    
    CharacterFlow --> RichPayload[Rich API Payload]
    RichPayload --> CharacterContext[Character Description]
    RichPayload --> PersonalityContext[Personality & Scenario]
    RichPayload --> LoreEntries[Character Book/Lore]
    RichPayload --> UserMessage2[User Message]
    RichPayload --> APISettings2[API Settings & Template]
    
    %% Both can switch
    AssistantFlow -.-> LoadCharacter[Load Character]
    LoadCharacter -.-> CharacterFlow
    CharacterFlow -.-> ClearCharacter[Clear Character]
    ClearCharacter -.-> AssistantFlow
```

### 2. **Assistant Mode vs Character Mode** 🤖
```mermaid
flowchart TD
    ChatStart[Chat Interface] --> Mode{Mode Type}
    
    Mode -->|Assistant Mode| AssistantFlow[Assistant Mode Flow]
    Mode -->|Character Mode| CharacterFlow[Character Mode Flow]
    
    AssistantFlow --> MinimalPayload[Minimal API Payload]
    MinimalPayload --> UserMessage[User Message Only]
    MinimalPayload --> SystemPrompt[Basic System Prompt]
    MinimalPayload --> APISettings[API Settings & Template]
    
    CharacterFlow --> RichPayload[Rich API Payload]
    RichPayload --> CharacterContext[Character Description]
    RichPayload --> PersonalityContext[Personality & Scenario]
    RichPayload --> LoreEntries[Character Book/Lore]
    RichPayload --> UserMessage2[User Message]
    RichPayload --> APISettings2[API Settings & Template]
    
    %% Both can switch
    AssistantFlow -.-> LoadCharacter[Load Character]
    LoadCharacter -.-> CharacterFlow
    CharacterFlow -.-> ClearCharacter[Clear Character]
    ClearCharacter -.-> AssistantFlow
```

### 3. **User Profile Gate** 👤
```mermaid
flowchart LR
    A[Ready to Chat] --> B{User Profile Set?}
    B -->|No| C[Show UserSelect Dialog]
    B -->|Yes| D[Begin Conversation]
    C --> D
```

### 4. **World vs Character Chat** 🌍
```mermaid
flowchart LR
    A[Chat Mode] --> B{Context Type}
    B -->|Character| C[Direct Character Chat]
    B -->|World| D[World-Based Chat]
    D --> E[Room Context + NPCs]
    D --> F[World Narrator Mode]
```

## State Dependencies

```mermaid
stateDiagram-v2
    [*] --> AppLoaded
    AppLoaded --> CharacterRequired : Navigate to Chat
    AppLoaded --> WorldSelection : Navigate to Worlds
    AppLoaded --> ConfigMode : Navigate to Settings
    
    CharacterRequired --> CharacterLoaded : Character Selected
    CharacterLoaded --> UserRequired : Character Ready
    UserRequired --> ChatReady : User Profile Set
    ChatReady --> ActiveChat : Begin Conversation
    
    WorldSelection --> WorldLoaded : World Selected
    WorldLoaded --> WorldPlay : Enter Play Mode
    WorldPlay --> ActiveChat : Begin World Chat
      ActiveChat --> ChatReady : End Session
    WorldPlay --> WorldSelection : Exit World
    ConfigMode --> AppLoaded : Settings Applied
```

## Implementation Guide: Assistant Mode Support

### **Core Requirements**
1. **No Character Validation**: Remove any blocking validation that requires a character to be loaded
2. **Minimal API Payload**: When no character is loaded, send streamlined payloads to the API
3. **Clear Mode Indication**: UI should clearly indicate when in Assistant Mode vs Character Mode
4. **Seamless Character Loading**: User can load a character at any time without losing chat context

### **API Payload Differences**

#### Assistant Mode Payload (No Character):
```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful AI assistant."},
    {"role": "user", "content": "User's message"}
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

#### Character Mode Payload (With Character):
```json
{
  "messages": [
    {"role": "system", "content": "Character description + personality + scenario"},
    {"role": "system", "content": "Character book entries (lore)"},
    {"role": "user", "content": "User's message"}
  ],
  "temperature": 0.8,
  "max_tokens": 500,
  "character_context": true
}
```

### **UI Affordances to Implement**
1. **Mode Indicator**: Show "Assistant Mode" or character name in chat header
2. **Character Load Option**: Subtle button/link to load character when in Assistant Mode
3. **Visual Distinction**: Different styling (subtle background color, icon) for Assistant Mode
4. **Transition Handling**: Smooth transition when switching between modes

### **State Management Changes**
- `characterData` can be `null` (currently required)
- Chat history should be preserved when switching modes
- API service should handle both payload types
- Template system should support basic assistant templates
