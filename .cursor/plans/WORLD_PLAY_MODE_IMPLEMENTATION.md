# World Play Mode Implementation Plan

> **Document Version:** 1.0  
> **Created:** December 13, 2025  
> **Parent Document:** WORLD_CARD_IMPLEMENTATION_PLAN.md  
> **Status:** Ready for Implementation  
> **Prerequisite:** Phases 1-3 complete (Schema, Gallery, Builder)

---

## Executive Summary

This document details the "Play World" experience - the interactive gameplay mode where users navigate rooms, interact with NPCs, and experience the world through a Narrator (the World Card itself). The design prioritizes reuse of the existing Chat system with a sidebar for world interaction.

---

## Key Design Decisions (Resolved)

| Question | Decision |
|----------|----------|
| Chat scope | Single chat session per world playthrough |
| NPC relationship | Linked, not moved - Characters exist independently, referenced by UUID |
| Narrator identity | World Card = Narrator; room descriptions injected per-room |
| Lore integration | Lore entries are keyword-triggered prompt enhancements |
| Layout | Chat (2/3 left) + World Panel (1/3 right) |

---

## 1. Layout Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: World Name | Current Room | [Settings] [Exit World]            │
├─────────────────────────────────────────────────────────────────────────┤
│                                           │                             │
│                                           │   ┌─────────────────────┐   │
│                                           │   │     ROOM IMAGE      │   │
│                                           │   │    (background)     │   │
│           CHAT AREA                       │   └─────────────────────┘   │
│      (existing ChatView)                  │                             │
│                                           │   ┌─────────────────────┐   │
│   Narrator describes room, NPCs speak,    │   │    MINI MAP         │   │
│   player interacts via chat input         │   │   (room graph)      │   │
│                                           │   └─────────────────────┘   │
│                                           │                             │
│                                           │   NPCs Present:             │
│                                           │   [Avatar] Name [Talk]      │
│                                           │   [Avatar] Name [Talk]      │
│                                           │                             │
│                                           │   Exits:                    │
│                                           │   [→ North] Tavern          │
│                                           │   [→ East] Market           │
│                                           │                             │
│                                           │   Actions:                  │
│                                           │   [Look Around]             │
│                                           │   [Inventory] (future)      │
│                                           │   [Attack] (future)         │
│                                           │                             │
├─────────────────────────────────────────────────────────────────────────┤
│  Chat Input: [________________________________] [Send]                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Source | Notes |
|-----------|--------|-------|
| Chat Area | Reuse `ChatView.tsx` | Minimal modifications needed |
| Chat Input | Reuse existing | No changes |
| World Panel | **New** `WorldPanel.tsx` | Right sidebar, modular sections |
| Room Image | **New** `RoomDisplay.tsx` | Shows room background |
| Mini Map | **New** `MiniMap.tsx` | Clickable room graph |
| NPC List | **New** `NPCList.tsx` | Shows NPCs in current room |
| Exits List | **New** `ExitsList.tsx` | Clickable navigation |
| Actions Panel | **New** `ActionsPanel.tsx` | Modular action buttons |

---

## 2. Chat System Integration

### 2.1 The Narrator Concept

The **World Card IS the Narrator**. When playing a world:

- `character` in chat context = World Card
- `system_prompt` = World Card's system_prompt + current room context
- `first_mes` = Room's `first_visit_text` or `description` (NOT World's first_mes)

**World Card's first_mes** is used ONLY for the initial world introduction, injected once at session start.

### 2.2 Context Injection Strategy

Each message to the LLM includes dynamic context:

```
[World System Prompt from World Card]
[World Lore Entries triggered by keywords in recent messages]
[Current Room Description]
[NPCs Present in Room - names and brief descriptions]
[Recent Chat History]
[User Message]
```

### 2.3 Room Transition Flow

When player moves to a new room:

1. Update `player_state.current_room_id`
2. Add room to `player_state.visited_rooms` if first visit
3. Inject room description into chat as Narrator message:
   - First visit: `first_visit_text` (if exists) or `description`
   - Return visit: `description` (shorter, acknowledges familiarity)
4. Update World Panel (NPCs, exits, image)
5. Trigger any room entry events (future)

### 2.4 NPC Interaction Flow

When player clicks "Talk" on an NPC:

**Option A: Context Switch (Simpler)**
- Narrator announces: "*You approach [NPC Name]...*"
- NPC's `first_mes` is injected (contextualized to room)
- Chat continues with NPC "speaking" but still in world session
- NPC messages tagged with their name
- Player can address multiple NPCs in same session

**Option B: Separate Chat (Cleaner but more complex)**
- Opens NPC's character chat in modal/slide-in
- Separate chat history
- Closing returns to world chat

**Recommendation:** Start with Option A for MVP - single chat stream, NPCs identified by name tags.

### 2.5 Lore Entry Integration

Lore entries work as **keyword-triggered prompt enhancements**:

```python
def build_context_with_lore(world_card, recent_messages, current_room):
    context_parts = []
    
    # Base world context
    context_parts.append(world_card.system_prompt)
    
    # Scan recent messages for lore keywords
    message_text = " ".join([m.content for m in recent_messages[-10:]])
    
    for entry in world_card.character_book.entries:
        if entry.enabled and matches_keywords(message_text, entry.keys):
            # Inject as: [keyword context] + [lore content]
            context_parts.append(f"[{entry.comment or entry.keys[0]}]: {entry.content}")
    
    # Current room context
    context_parts.append(f"Current Location - {current_room.name}: {current_room.description}")
    
    # NPCs present
    npc_descriptions = get_npc_brief_descriptions(current_room.npcs)
    if npc_descriptions:
        context_parts.append(f"Present: {npc_descriptions}")
    
    return "\n\n".join(context_parts)
```

---

## 3. State Management

### 3.1 WorldPlayContext

```typescript
// contexts/WorldPlayContext.tsx

interface WorldPlayState {
  // World data (from card)
  worldCard: CharacterCard;
  worldData: WorldData;
  
  // Current session state
  currentRoom: Room;
  visitedRooms: Set<string>;
  playerState: PlayerState;
  
  // Chat integration
  chatSessionId: string;
  
  // UI state
  isPanelCollapsed: boolean;
  selectedNPC: string | null;
}

interface WorldPlayActions {
  // Navigation
  moveToRoom: (roomId: string) => Promise<void>;
  
  // NPC interaction
  talkToNPC: (npcUuid: string) => void;
  
  // Actions
  lookAround: () => void;
  
  // State persistence
  saveProgress: () => Promise<void>;
  resetWorld: () => Promise<void>;
  
  // Chat integration
  injectNarratorMessage: (content: string) => void;
}
```

### 3.2 Player State Persistence

Player state saved to World Card's `extensions.world_data.player_state`:

```typescript
interface PlayerState {
  current_room_id: string;
  visited_rooms: string[];
  inventory: string[];           // Future
  flags: Record<string, any>;    // Quest/story flags
  relationships: Record<string, number>;  // NPC affinity
  chat_session_id: string;       // Links to chat history
  last_played: string;           // ISO timestamp
}
```

**Save triggers:**
- Room transition
- Every N messages (auto-save)
- Manual save button
- On exit/close

---

## 4. Component Specifications

### 4.1 WorldPlayView.tsx (Main Container)

```typescript
// views/WorldPlayView.tsx

export const WorldPlayView: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { state, actions } = useWorldPlay(uuid);
  
  if (!state.worldCard) return <Loading />;
  
  return (
    <WorldPlayProvider value={{ state, actions }}>
      <div className="flex h-screen bg-gray-900">
        {/* Chat Area - 2/3 width */}
        <div className="flex-1 flex flex-col min-w-0">
          <WorldPlayHeader />
          <ChatArea 
            characterCard={state.worldCard}
            sessionId={state.chatSessionId}
            contextBuilder={buildWorldContext}
          />
        </div>
        
        {/* World Panel - 1/3 width */}
        <WorldPanel 
          collapsed={state.isPanelCollapsed}
          onToggle={() => actions.togglePanel()}
        />
      </div>
    </WorldPlayProvider>
  );
};
```

### 4.2 WorldPanel.tsx (Right Sidebar)

```typescript
// components/world-play/WorldPanel.tsx

interface WorldPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const WorldPanel: React.FC<WorldPanelProps> = ({ collapsed, onToggle }) => {
  const { state, actions } = useWorldPlayContext();
  
  if (collapsed) {
    return (
      <div className="w-12 bg-gray-800 flex flex-col items-center py-4">
        <button onClick={onToggle}>
          <ChevronLeft />
        </button>
        {/* Minimal icons for map, NPCs when collapsed */}
      </div>
    );
  }
  
  return (
    <div className="w-80 bg-gray-800 flex flex-col border-l border-gray-700">
      {/* Room Image */}
      <RoomDisplay room={state.currentRoom} />
      
      {/* Mini Map */}
      <MiniMap 
        rooms={state.worldData.rooms}
        currentRoomId={state.currentRoom.id}
        visitedRooms={state.visitedRooms}
        onRoomClick={actions.moveToRoom}
      />
      
      {/* NPCs in Room */}
      <NPCList 
        npcs={state.currentRoom.npcs}
        onTalk={actions.talkToNPC}
      />
      
      {/* Available Exits */}
      <ExitsList 
        connections={state.currentRoom.connections}
        rooms={state.worldData.rooms}
        onNavigate={actions.moveToRoom}
      />
      
      {/* Action Buttons */}
      <ActionsPanel 
        onLookAround={actions.lookAround}
        enableInventory={state.worldData.settings.enable_inventory}
        enableCombat={state.worldData.settings.enable_combat}
      />
      
      {/* Collapse Toggle */}
      <button onClick={onToggle} className="p-2">
        <ChevronRight />
      </button>
    </div>
  );
};
```

### 4.3 MiniMap.tsx

```typescript
// components/world-play/MiniMap.tsx

interface MiniMapProps {
  rooms: Room[];
  currentRoomId: string;
  visitedRooms: Set<string>;
  onRoomClick: (roomId: string) => void;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  rooms,
  currentRoomId,
  visitedRooms,
  onRoomClick
}) => {
  // Build adjacency for layout
  const roomMap = useMemo(() => buildRoomGraph(rooms), [rooms]);
  
  return (
    <div className="p-3 border-b border-gray-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Map</h3>
      <div className="relative h-32 bg-gray-900 rounded">
        {rooms.map(room => {
          const position = roomMap.positions[room.id];
          const isCurrent = room.id === currentRoomId;
          const isVisited = visitedRooms.has(room.id);
          const isAdjacent = roomMap.adjacent[currentRoomId]?.includes(room.id);
          
          return (
            <button
              key={room.id}
              onClick={() => isAdjacent && onRoomClick(room.id)}
              disabled={!isAdjacent}
              className={`
                absolute w-6 h-6 rounded-full border-2 transition-all
                ${isCurrent ? 'bg-blue-500 border-blue-300 scale-125' : ''}
                ${isVisited && !isCurrent ? 'bg-gray-600 border-gray-500' : ''}
                ${!isVisited && !isCurrent ? 'bg-gray-800 border-gray-700' : ''}
                ${isAdjacent && !isCurrent ? 'hover:bg-gray-500 cursor-pointer' : ''}
                ${!isAdjacent && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              style={{ left: position.x, top: position.y }}
              title={isVisited || isCurrent ? room.name : '???'}
            />
          );
        })}
        
        {/* Connection lines */}
        <svg className="absolute inset-0 pointer-events-none">
          {renderConnections(rooms, roomMap, currentRoomId, visitedRooms)}
        </svg>
      </div>
    </div>
  );
};
```

### 4.4 NPCList.tsx

```typescript
// components/world-play/NPCList.tsx

interface NPCListProps {
  npcs: RoomNPC[];
  onTalk: (characterUuid: string) => void;
}

export const NPCList: React.FC<NPCListProps> = ({ npcs, onTalk }) => {
  if (npcs.length === 0) return null;
  
  return (
    <div className="p-3 border-b border-gray-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Present</h3>
      <div className="space-y-2">
        {npcs.map(npc => (
          <NPCListItem 
            key={npc.character_uuid}
            characterUuid={npc.character_uuid}
            onTalk={() => onTalk(npc.character_uuid)}
          />
        ))}
      </div>
    </div>
  );
};

const NPCListItem: React.FC<{ characterUuid: string; onTalk: () => void }> = ({
  characterUuid,
  onTalk
}) => {
  // Fetch linked character card data
  const { character, loading } = useCharacterCard(characterUuid);
  
  if (loading) return <Skeleton />;
  if (!character) return null;
  
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-700 rounded">
      <img 
        src={character.avatar} 
        alt={character.name}
        className="w-8 h-8 rounded-full object-cover"
      />
      <span className="flex-1 text-sm text-white truncate">
        {character.name}
      </span>
      <button
        onClick={onTalk}
        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
      >
        Talk
      </button>
    </div>
  );
};
```

### 4.5 ExitsList.tsx

```typescript
// components/world-play/ExitsList.tsx

interface ExitsListProps {
  connections: RoomConnection[];
  rooms: Room[];
  onNavigate: (roomId: string) => void;
}

export const ExitsList: React.FC<ExitsListProps> = ({
  connections,
  rooms,
  onNavigate
}) => {
  const roomLookup = useMemo(
    () => Object.fromEntries(rooms.map(r => [r.id, r])),
    [rooms]
  );
  
  if (connections.length === 0) {
    return (
      <div className="p-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Exits</h3>
        <p className="text-sm text-gray-500 italic">No obvious exits</p>
      </div>
    );
  }
  
  return (
    <div className="p-3 border-b border-gray-700">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Exits</h3>
      <div className="space-y-1">
        {connections.map(conn => {
          const targetRoom = roomLookup[conn.target_room_id];
          if (!targetRoom) return null;
          
          return (
            <button
              key={conn.target_room_id}
              onClick={() => !conn.locked && onNavigate(conn.target_room_id)}
              disabled={conn.locked}
              className={`
                w-full flex items-center gap-2 p-2 rounded text-left text-sm
                ${conn.locked 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'}
              `}
            >
              {conn.direction && (
                <span className="text-gray-400">[{conn.direction}]</span>
              )}
              <span className="flex-1">{targetRoom.name}</span>
              {conn.locked && <Lock size={14} className="text-red-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

### 4.6 ActionsPanel.tsx

```typescript
// components/world-play/ActionsPanel.tsx

interface ActionsPanelProps {
  onLookAround: () => void;
  enableInventory: boolean;
  enableCombat: boolean;
  // Future: onInventory, onAttack, etc.
}

export const ActionsPanel: React.FC<ActionsPanelProps> = ({
  onLookAround,
  enableInventory,
  enableCombat
}) => {
  return (
    <div className="p-3 mt-auto">
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Actions</h3>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton 
          icon={<Eye size={16} />}
          label="Look Around"
          onClick={onLookAround}
        />
        
        {enableInventory && (
          <ActionButton 
            icon={<Backpack size={16} />}
            label="Inventory"
            onClick={() => {/* Future */}}
            disabled
          />
        )}
        
        {enableCombat && (
          <ActionButton 
            icon={<Sword size={16} />}
            label="Attack"
            onClick={() => {/* Future */}}
            disabled
          />
        )}
        
        <ActionButton 
          icon={<Save size={16} />}
          label="Save"
          onClick={() => {/* Save progress */}}
        />
      </div>
    </div>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center justify-center gap-1 p-2 rounded text-xs
      ${disabled 
        ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
        : 'bg-gray-700 hover:bg-gray-600 text-white'}
    `}
  >
    {icon}
    {label}
  </button>
);
```

---

## 5. useWorldPlay Hook

```typescript
// hooks/useWorldPlay.ts

export function useWorldPlay(worldUuid: string) {
  const [state, dispatch] = useReducer(worldPlayReducer, initialState);
  const { sendMessage, injectSystemMessage } = useChatMessages();
  
  // Load world card and initialize
  useEffect(() => {
    async function init() {
      const worldCard = await fetchCharacterCard(worldUuid);
      const worldData = worldCard.data.extensions.world_data as WorldData;
      
      // Load or create player state
      let playerState = worldData.player_state;
      if (!playerState) {
        playerState = createInitialPlayerState(worldData.settings);
      }
      
      // Find current room
      const currentRoom = worldData.rooms.find(
        r => r.id === playerState.current_room_id
      );
      
      // Initialize or resume chat session
      const chatSessionId = playerState.chat_session_id || createNewChatSession();
      
      dispatch({
        type: 'INITIALIZE',
        payload: { worldCard, worldData, playerState, currentRoom, chatSessionId }
      });
      
      // If new session, inject world introduction
      if (!worldData.player_state) {
        injectNarratorMessage(worldCard.data.first_mes);
        injectNarratorMessage(currentRoom.first_visit_text || currentRoom.description);
      }
    }
    init();
  }, [worldUuid]);
  
  // Action: Move to room
  const moveToRoom = useCallback(async (targetRoomId: string) => {
    const currentRoom = state.currentRoom;
    const connection = currentRoom.connections.find(
      c => c.target_room_id === targetRoomId
    );
    
    if (!connection) {
      console.error('No connection to target room');
      return;
    }
    
    if (connection.locked) {
      injectNarratorMessage(`*The way is blocked. ${connection.lock_condition || ''}*`);
      return;
    }
    
    const targetRoom = state.worldData.rooms.find(r => r.id === targetRoomId);
    if (!targetRoom) return;
    
    const isFirstVisit = !state.visitedRooms.has(targetRoomId);
    
    // Narrate the transition
    if (connection.description) {
      injectNarratorMessage(`*${connection.description}*`);
    }
    
    // Describe the new room
    const roomText = isFirstVisit 
      ? (targetRoom.first_visit_text || targetRoom.description)
      : targetRoom.description;
    injectNarratorMessage(roomText);
    
    // Update state
    dispatch({
      type: 'MOVE_TO_ROOM',
      payload: { room: targetRoom, isFirstVisit }
    });
    
    // Persist
    await savePlayerState({
      ...state.playerState,
      current_room_id: targetRoomId,
      visited_rooms: [...state.visitedRooms, targetRoomId]
    });
  }, [state, injectNarratorMessage]);
  
  // Action: Talk to NPC
  const talkToNPC = useCallback((npcUuid: string) => {
    const npc = state.currentRoom.npcs.find(n => n.character_uuid === npcUuid);
    if (!npc) return;
    
    // Fetch NPC character card for name
    fetchCharacterCard(npcUuid).then(npcCard => {
      // Narrator introduces the interaction
      injectNarratorMessage(`*You approach ${npcCard.name}.*`);
      
      // Set selected NPC for context injection
      dispatch({ type: 'SELECT_NPC', payload: npcUuid });
      
      // NPC's greeting (contextualized)
      // This could use a room-specific greeting if defined, or fall back to first_mes
      const greeting = npcCard.data.first_mes;
      injectNPCMessage(npcCard.name, greeting);
    });
  }, [state.currentRoom]);
  
  // Action: Look around
  const lookAround = useCallback(() => {
    const room = state.currentRoom;
    let description = room.description;
    
    // Add NPC presence
    if (room.npcs.length > 0) {
      // This would be enhanced to fetch NPC names
      description += "\n\n*You notice someone here...*";
    }
    
    // Add ambient text if available
    if (room.ambient_text) {
      const ambientLines = room.ambient_text.split('\n');
      const randomLine = ambientLines[Math.floor(Math.random() * ambientLines.length)];
      description += `\n\n*${randomLine}*`;
    }
    
    injectNarratorMessage(description);
  }, [state.currentRoom]);
  
  // Inject narrator message into chat
  const injectNarratorMessage = useCallback((content: string) => {
    injectSystemMessage({
      role: 'assistant',
      content,
      name: 'Narrator',
      timestamp: Date.now()
    });
  }, [injectSystemMessage]);
  
  // Inject NPC message into chat
  const injectNPCMessage = useCallback((npcName: string, content: string) => {
    injectSystemMessage({
      role: 'assistant',
      content,
      name: npcName,
      timestamp: Date.now()
    });
  }, [injectSystemMessage]);
  
  return {
    state,
    actions: {
      moveToRoom,
      talkToNPC,
      lookAround,
      injectNarratorMessage,
      saveProgress: () => savePlayerState(state.playerState),
      resetWorld: () => resetWorldState(worldUuid)
    }
  };
}
```

---

## 6. Backend Support

### 6.1 Context Building Endpoint

```python
# POST /api/world-play/{world_uuid}/build-context

@router.post("/{world_uuid}/build-context")
async def build_world_context(
    world_uuid: str,
    request: BuildContextRequest
):
    """
    Build LLM context for world play, including:
    - World system prompt
    - Triggered lore entries
    - Current room description
    - NPC presence
    """
    world_card = await get_character_card(world_uuid)
    world_data = world_card["data"]["extensions"]["world_data"]
    
    context_parts = []
    
    # 1. World system prompt
    if world_card["data"]["system_prompt"]:
        context_parts.append(world_card["data"]["system_prompt"])
    
    # 2. Narrator voice instruction
    voice = world_data["settings"]["narrator_voice"]
    voice_instructions = {
        "first_person": "Narrate from a first-person perspective as an observer in this world.",
        "second_person": "Narrate in second person, addressing the player as 'you'.",
        "third_person": "Narrate in third person, describing the player's actions objectively."
    }
    context_parts.append(voice_instructions.get(voice, voice_instructions["second_person"]))
    
    # 3. Triggered lore entries
    recent_text = " ".join(request.recent_messages)
    character_book = world_card["data"].get("character_book", {})
    
    for entry in character_book.get("entries", []):
        if not entry.get("enabled", True):
            continue
        if matches_keywords(recent_text, entry.get("keys", [])):
            label = entry.get("comment") or entry.get("keys", [""])[0]
            context_parts.append(f"[{label}]: {entry.get('content', '')}")
    
    # 4. Current room context
    current_room = next(
        (r for r in world_data["rooms"] if r["id"] == request.current_room_id),
        None
    )
    if current_room:
        context_parts.append(
            f"Current Location - {current_room['name']}: {current_room['description']}"
        )
    
    # 5. NPCs present
    if current_room and current_room.get("npcs"):
        npc_descriptions = []
        for npc in current_room["npcs"]:
            npc_card = await get_character_card(npc["character_uuid"])
            if npc_card:
                npc_descriptions.append(
                    f"{npc_card['name']}: {npc_card['description'][:100]}..."
                )
        if npc_descriptions:
            context_parts.append(f"Present in this location: {', '.join(npc_descriptions)}")
    
    # 6. Selected NPC focus (if talking to specific NPC)
    if request.selected_npc_uuid:
        npc_card = await get_character_card(request.selected_npc_uuid)
        if npc_card:
            context_parts.append(
                f"You are currently interacting with {npc_card['name']}. "
                f"Personality: {npc_card['data']['personality']}"
            )
    
    return {
        "context": "\n\n".join(context_parts),
        "room_name": current_room["name"] if current_room else None
    }
```

### 6.2 Player State Endpoints

```python
# POST /api/world-play/{world_uuid}/save-state
@router.post("/{world_uuid}/save-state")
async def save_player_state(world_uuid: str, player_state: PlayerState):
    """Persist player state to world card"""
    world_card = await get_character_card(world_uuid)
    world_card["data"]["extensions"]["world_data"]["player_state"] = player_state.dict()
    await save_character_card(world_uuid, world_card)
    return {"success": True}

# POST /api/world-play/{world_uuid}/reset
@router.post("/{world_uuid}/reset")
async def reset_world(world_uuid: str):
    """Clear player state, start fresh"""
    world_card = await get_character_card(world_uuid)
    world_card["data"]["extensions"]["world_data"]["player_state"] = None
    await save_character_card(world_uuid, world_card)
    return {"success": True}
```

---

## 7. Implementation Checklist

### Phase 4a: Core Play Infrastructure

- [ ] Create `WorldPlayContext.tsx`
- [ ] Create `useWorldPlay.ts` hook
- [ ] Create `WorldPlayView.tsx` main container
- [ ] Integrate existing `ChatView` into layout
- [ ] Test: Can load world and see chat area

### Phase 4b: World Panel Components

- [ ] Create `WorldPanel.tsx` container
- [ ] Create `RoomDisplay.tsx` (room image)
- [ ] Create `MiniMap.tsx` (room graph)
- [ ] Create `NPCList.tsx`
- [ ] Create `ExitsList.tsx`
- [ ] Create `ActionsPanel.tsx`
- [ ] Test: Panel renders with mock data

### Phase 4c: Navigation & State

- [ ] Implement `moveToRoom` action
- [ ] Implement room transition narration
- [ ] Track visited rooms
- [ ] Implement first-visit vs return-visit text
- [ ] Create player state persistence endpoints
- [ ] Test: Can navigate between rooms, state persists

### Phase 4d: NPC Interaction

- [ ] Implement `talkToNPC` action
- [ ] Fetch linked character cards for NPCs
- [ ] Inject NPC messages with name tags
- [ ] Handle NPC context in chat
- [ ] Test: Can talk to NPC, they respond in character

### Phase 4e: Context & Lore Integration

- [ ] Create `/build-context` endpoint
- [ ] Implement keyword matching for lore entries
- [ ] Inject lore into LLM context
- [ ] Test: Lore triggers when keywords mentioned

### Phase 4f: Polish

- [ ] "Look Around" action with ambient text
- [ ] Save/load progress
- [ ] Reset world function
- [ ] Handle locked doors
- [ ] Loading states and error handling
- [ ] Responsive layout adjustments

---

## 8. Future Enhancements (Post-MVP)

| Feature | Description | Trigger |
|---------|-------------|---------|
| Dynamic Map Building | Parse lore entries for location keywords, auto-generate rooms | Separate epic |
| Inventory System | Items, pickup, use, trade | `enable_inventory` flag |
| Combat System | Turn-based or real-time combat | `enable_combat` flag |
| Time System | Day/night, event scheduling | `time_system` setting |
| Multiple Save Slots | Different playthroughs | User request |
| World Events | Triggered narrative events | Event system |
| Relationship Tracking | NPC affinity affects dialogue | `relationships` in state |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-13 | Claude + James | Initial play mode plan |

---

*Reference this document alongside WORLD_CARD_IMPLEMENTATION_PLAN.md for complete context.*
