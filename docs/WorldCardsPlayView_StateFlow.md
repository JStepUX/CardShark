# WorldCardsPlayView State Flow

## Component State Management & User Interactions

```mermaid
stateDiagram-v2
    [*] --> Initializing
    
    %% Initial Loading States
    Initializing --> LoadingWorld : Component Mounts
    LoadingWorld --> WorldLoadError : World Load Fails
    LoadingWorld --> ValidatingRoom : World Loaded Successfully
    
    ValidatingRoom --> NoRoomError : No Current Room Found
    ValidatingRoom --> ReadyToPlay : Valid Room Found
    
    %% Error States
    WorldLoadError --> LoadingWorld : User Dismisses Error & Retry
    NoRoomError --> LoadingWorld : User Dismisses Error & Retry
    
    %% Main Play State
    ReadyToPlay --> ActivePlay : World & Room Ready
    
    state ActivePlay {
        [*] --> ChatMode
        
        %% Chat Sub-States
        state ChatMode {
            [*] --> CheckingUser
            CheckingUser --> UserSelectOpen : No User Profile
            CheckingUser --> ChatReady : User Profile Set
            UserSelectOpen --> ChatReady : User Selected
            ChatReady --> GeneratingResponse : User Sends Message
            ChatReady --> RegeneratingMessage : User Clicks Regenerate
            GeneratingResponse --> ChatReady : Response Complete
            RegeneratingMessage --> ChatReady : Regeneration Complete
        }
        
        %% Dialog States (Parallel to Chat)
        ChatMode --> MapDialogOpen : User Clicks Map
        ChatMode --> NpcDialogOpen : User Clicks NPCs
        
        MapDialogOpen --> NavigatingRoom : User Selects Room
        MapDialogOpen --> ChatMode : User Closes Dialog
        
        NpcDialogOpen --> LoadingNPC : User Selects NPC
        NpcDialogOpen --> ChatMode : User Closes Dialog
        
        NavigatingRoom --> ChatMode : Room Navigation Complete
        LoadingNPC --> ChatMode : NPC Loaded & Introduction Generated
    }
    
    %% Cleanup
    ActivePlay --> [*] : Component Unmounts
```

## Critical State Transitions & Side Effects

```mermaid
flowchart TD
    Start([Component Mount]) --> LoadWorld[Load World Data]
    LoadWorld --> ProcessLocations[Ensure All Locations Connected]
    ProcessLocations --> GetCurrentRoom[Get Current Room from World State]
    
    GetCurrentRoom --> HasRoom{Current Room Exists?}
    HasRoom -->|No| ShowError[Show No Room Error]
    HasRoom -->|Yes| CreateNarrator[Create World Narrator Character]
    
    CreateNarrator --> LoadChat[Load or Create Chat ID]
    LoadChat --> SetupTimeouts[Setup Generation Timeouts]
    SetupTimeouts --> ReadyState[Ready to Play]
    
    %% User Interactions
    ReadyState --> UserActions{User Action}
    
    %% Map Navigation
    UserActions --> OpenMap[Open Map Dialog]
    OpenMap --> SelectRoom[User Selects Room]
    SelectRoom --> UpdateWorldState[Update World State with New Position]
    UpdateWorldState --> SaveWorldState[Save Updated State to Backend]
    SaveWorldState --> GenerateRoomMessage[Generate Room Transition Message]
    GenerateRoomMessage --> ReadyState
    
    %% NPC Interaction
    UserActions --> OpenNPCs[Open NPC Dialog]
    OpenNPCs --> SelectNPC[User Selects NPC]
    SelectNPC --> LoadNPCData[Load NPC Character Data from Backend]
    LoadNPCData --> SetActiveCharacter[Set NPC as Active Character]
    SetActiveCharacter --> GenerateIntro[Generate NPC Introduction]
    GenerateIntro --> ReadyState
    
    %% Chat Interaction
    UserActions --> SendMessage[User Sends Message]
    SendMessage --> CheckUser{User Profile Set?}
    CheckUser -->|No| ShowUserSelect[Show User Select Dialog]
    CheckUser -->|Yes| GenerateResponse[Generate AI Response]
    ShowUserSelect --> GenerateResponse
    GenerateResponse --> SaveChat[Save Chat Messages]
    SaveChat --> ReadyState
    
    %% Error Handling
    ShowError --> DismissError[User Dismisses Error]
    DismissError --> LoadWorld
    
    style LoadWorld fill:#ffcc99
    style ReadyState fill:#ccffcc
    style ShowError fill:#ff9999
    style GenerateResponse fill:#99ccff
```

## State Dependencies & Data Flow

```mermaid
flowchart LR
    subgraph "External Dependencies"
        WorldID[worldId from URL]
        APIConfig[API Configuration]
        CharacterContext[Character Context]
    end
    
    subgraph "Local State"
        WorldState[worldState]
        CurrentRoom[currentRoom]
        CurrentRoomName[currentRoomName]
        ChatID[chatId]
        LoadingState[isLoadingWorld]
        ErrorState[worldLoadError]
    end
    
    subgraph "Dialog States"
        UserSelectOpen[showUserSelect]
        NPCDialogOpen[isNpcDialogOpen]
        MapDialogOpen[isMapDialogOpen]
    end
    
    subgraph "Chat Hook State"
        Messages[messages]
        IsGenerating[isGenerating]
        CurrentUser[currentUser]
        ChatError[chatError]
    end
    
    %% Dependencies
    WorldID --> WorldState
    WorldState --> CurrentRoom
    CurrentRoom --> CurrentRoomName
    APIConfig --> Messages
    CharacterContext --> Messages
    
    %% State Interactions
    CurrentRoom --> NPCDialogOpen
    WorldState --> MapDialogOpen
    CurrentUser --> UserSelectOpen
    IsGenerating --> Messages
    
    %% Error Flow
    LoadingState --> ErrorState
    ErrorState --> WorldState
```

## Error Handling & Recovery Patterns

```mermaid
flowchart TD
    subgraph "Error Types"
        WorldLoadError[World Load Error]
        NoRoomError[No Current Room Error]
        NavigationError[Room Navigation Error]
        NPCLoadError[NPC Load Error]
        ChatError[Chat Generation Error]
    end
    
    subgraph "Recovery Strategies"
        RetryLoad[Retry World Load]
        FallbackRoom[Use Default Room]
        ShowErrorMessage[Display Error to User]
        ClearErrorState[Clear Error & Continue]
    end
    
    WorldLoadError --> ShowErrorMessage
    WorldLoadError --> RetryLoad
    
    NoRoomError --> ShowErrorMessage
    NoRoomError --> FallbackRoom
    
    NavigationError --> ShowErrorMessage
    NavigationError --> ClearErrorState
    
    NPCLoadError --> ShowErrorMessage
    NPCLoadError --> ClearErrorState
    
    ChatError --> ShowErrorMessage
    ChatError --> ClearErrorState
    
    style WorldLoadError fill:#ff6666
    style NoRoomError fill:#ff6666
    style NavigationError fill:#ffaa66
    style NPCLoadError fill:#ffaa66
    style ChatError fill:#ffaa66
```

## Performance & Cleanup Considerations

```mermaid
flowchart TD
    subgraph "Timeout Management"
        GenerationTimeout[30s Generation Timeout]
        HardTimeout[60s Hard Timeout]
        StallDetection[8s Stall Detection]
    end
    
    subgraph "Cleanup Operations"
        ClearTimeouts[Clear All Timeouts]
        StopGeneration[Stop Active Generation]
        SaveChatState[Save Current Chat State]
    end
    
    subgraph "Performance Optimizations"
        DebounceScroll[Debounced Scroll to Bottom]
        MemoizedCallbacks[Memoized Event Handlers]
        ConditionalRendering[Conditional Dialog Rendering]
    end
    
    GenerationTimeout --> StopGeneration
    HardTimeout --> StopGeneration
    StallDetection --> StopGeneration
    
    StopGeneration --> ClearTimeouts
    ClearTimeouts --> SaveChatState
    
    style ClearTimeouts fill:#99ff99
    style StopGeneration fill:#ff9999
    style SaveChatState fill:#99ccff
```
