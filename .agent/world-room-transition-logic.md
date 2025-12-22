# World Card Room Transition & NPC Summoning - REVISED IMPLEMENTATION

## Critical Correction: Session Model

### ❌ WRONG (Original Plan)
- ChatContext loads a new session for each NPC
- NPC selection triggers new chat session creation
- Each character has their own chat history

### ✅ CORRECT (Implemented)
- **ONE chat session per world playthrough**
- NPC selection changes active responder, NOT the session
- All messages (room, NPC, narrator) go to the SAME `chat_session_uuid`
- Session persists across rooms and NPC interactions

## Session Flow

### World Entry
1. Create or load `chat_session_uuid` for this world playthrough
2. Session persists across ALL rooms and NPC interactions
3. NO new sessions are created during world exploration

### Room Navigation
1. Append system message (room introduction) to SAME session
2. Inject room description into prompt context
3. Does NOT create new session
4. Prunes messages (keeps last 2) for context management

### NPC Selection
1. Set `activeNpcId` for {{char}} resolution in prompts
2. Does NOT call `setCharacterDataInContext` (would trigger new session)
3. Generate dynamic entrance message → append to SAME session
4. Subsequent user messages use active NPC as responder
5. All still in the SAME session

### Narrator Mode
1. When NO NPC is active, user can still send messages
2. Responses are narrator/system (room atmosphere, scene description)
3. SAME session continues

## Implementation Details

### State Management

```typescript
// WorldPlayView.tsx
const [activeNpcId, setActiveNpcId] = useState<string | undefined>(); // Active responder, NOT session
const [activeNpcName, setActiveNpcName] = useState<string>(''); // For display
const [showPartyGatherModal, setShowPartyGatherModal] = useState(false);
const [pendingDestination, setPendingDestination] = useState<GridRoom | null>(null);
```

### NPC Summoning (Corrected)

**CRITICAL**: Does NOT change the chat session

```typescript
const handleSelectNpc = useCallback(async (npcId: string) => {
  const npc = roomNpcs.find(n => n.id === npcId);
  
  // Set active NPC (changes who responds, NOT the session)
  setActiveNpcId(npcId);
  setActiveNpcName(npc.name);
  
  // Fetch NPC character data
  const npcCharacterData = await fetch(`/api/character/${npcId}`).then(r => r.json());
  
  // CRITICAL: Do NOT call setCharacterDataInContext here
  // That would trigger a new session load
 // Instead, we track activeNpcId and use it to resolve {{char}} in prompts
  
  // Generate dynamic entrance using /api/generate-greeting
  const greetingResponse = await fetch('/api/generate-greeting', {
    method: 'POST',
    body: JSON.stringify({
      character_data: npcCharacterData,
      api_config: null
    })
  });
  
  // Stream and add to SAME session
  const entranceMessage = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: generatedEntrance.trim() || `*${npc.name} enters the scene*`,
    timestamp: Date.now(),
    metadata: {
      type: 'npc_introduction',
      npcId: npcId,
      roomId: currentRoom.id,
      characterId: npcCharacterData.data?.character_uuid,
      generated: true
    }
  };
  
  addMessage(entranceMessage); // Adds to existing session
}, [roomNpcs, currentRoom, addMessage]);
```

**Note**: `first_mes` is GENERATED (not pulled from card), contextual to the room

### Room Transition

```typescript
const performRoomTransition = useCallback(async (
  targetRoom: GridRoom,
  keepActiveNpc: boolean = false
) => {
  // PRUNE MESSAGES: Keep only last 2 for continuity
  if (messages.length > 0) {
    const lastTwoMessages = messages.slice(-2);
    setMessages(lastTwoMessages);
  }
  
  // Update room state
  setCurrentRoom(targetRoom);
  
  // Clear active NPC unless keeping them
  if (!keepActiveNpc) {
    setActiveNpcId(undefined);
    setActiveNpcName('');
  }
  
  // Add room introduction to SAME session
  const roomIntroMessage = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: targetRoom.introduction_text,
    metadata: {
      type: 'room_introduction',
      roomId: targetRoom.id
    }
  };
  addMessage(roomIntroMessage);
  
  // If keeping NPC, note they followed
  if (keepActiveNpc && activeNpcName) {
    const followMessage = {
      content: `*${activeNpcName} follows you into ${targetRoom.name}*`,
      metadata: { type: 'npc_travel', npcId: activeNpcId, roomId: targetRoom.id }
    };
    addMessage(followMessage);
  }
}, [worldState, worldId, messages, setMessages, addMessage, activeNpcName, activeNpcId]);
```

## New Feature: Party Gather Modal

**Component**: `PartyGatherModal.tsx`

**Trigger**: User navigates while an NPC is active

**UI**: Baldur's Gate-inspired prompt:
```
"You must gather your party before venturing forth..."

Bring {npcName} with you to {destinationRoomName}?

[Stay Here]  [Come Along]
```

**Flow**:
```typescript
handleNavigate:
  if activeNpcId !== null:
    setPendingDestination(targetRoom)
    setShowPartyGatherModal(true)
    return // Don't navigate yet
  else:
    performRoomTransition(targetRoom)

handleBringNpcAlong:
  performRoomTransition(pendingDestination, keepActiveNpc: true)
  // Keeps activeNpcId, adds "*NPC follows you*" message

handleLeaveNpcHere:
  addMessage("*NPC stays behind*")
  clear activeNpcId
  performRoomTransition(pendingDestination, keepActiveNpc: false)
```

## Message Metadata

All messages tagged for tracking (still ONE session):

### Room Introduction
```typescript
{
  type: 'room_introduction',
  roomId: string
}
```

### NPC Introduction (Generated)
```typescript
{
  type: 'npc_introduction',
  npcId: string,
  roomId: string,
  characterId: string,
  generated: true  // Indicates dynamic generation
}
```

### NPC Travel
```typescript
{
  type: 'npc_travel',
  npcId: string,
  roomId: string
}
```

### NPC Farewell
```typescript
{
  type: 'npc_farewell',
  npcId: string
}
```

## Key Implementation Files

1. **`ChatContext.tsx`** - Added `setMessages()` for message pruning
2. **`WorldPlayView.tsx`** - Main orchestration:
   - `handleSelectNpc()` - Tracks active NPC WITHOUT changing session
   - `performRoomTransition()` - Shared transition logic
   - `handleNavigate()` - Checks for party gather modal
   - `handleBringNpcAlong()` - Keeps NPC during transition
   - `handleLeaveNpcHere()` - Clears NPC before transition
   3. **`PartyGatherModal.tsx`** - Party gather UI component

## MVP Constraints

- **Party Size**: 1 (one active NPC maximum)
- **Travel Persistence**: Session-only (NPCs return to home room on world reload)
- **Multi-NPC Conversations**: Deferred to future release
- **Narrator Mode**: Basic implementation (future: enhanced scene descriptions)

## Verification Scenarios

### Session Continuity
1. Enter world, visit room A, talk to NPC1
2. Visit room B, talk to NPC2
3. Visit room C, talk to NPC1 again
4. Reload page, return to world
5. **Verify**: Entire conversation history preserved as ONE session

### NPC Summoning
1. Enter room with NPC present
2. Select NPC
3. **Verify**: Dynamic entrance message generated (not static first_mes from card)
4. **Verify**: Entrance references room context
5. **Verify**: No new session created (check chat history continuity)

### Party Gather
1. Summon NPC in room A
2. Open map, select room B
3. **Verify**: Modal appears with correct NPC name and destination
4. Test "Come Along": 
   - NPC remains active in new room
   - Follow message appears
   - Session continues
5. Test "Stay here":
   - NPC cleared
   - Farewell message appears
   - Player enters alone
   - Session continues

### Narrator Mode
1. Enter room with no NPCs (or don't select any)
2. Send message: "I look around"
3. **Verify**: Narrator/system response (not error, not silence)
4. **Verify**: Response is added to SAME session

### Message Pruning
1. Generate 10+ messages across 2-3 rooms
2. Navigate to new room
3. **Verify**: Only last 2 messages retained
4. **Verify**: Room introduction added
5. **Verify**: Session UUID unchanged

## Future Enhancements

1. **Multi-NPC Party**: Support 2-3 active NPCs with context management
2. **Smart Narrator**: Enhanced scene descriptions based on room state
3. **NPC Persistence**: Remember NPC locations across sessions
4. **Dynamic NPC Behavior**: NPCs can move between rooms autonomously
5. **Advanced Pruning**: Importance-based message retention
6. **Party Dialogue**: Multi-character conversations

## Architecture Benefits

1. **Single Source of Truth**: One session = simpler state management
2. **Context Efficiency**: Message pruning prevents token overflow
3. **Continuity**: Last 2 messages maintain recent context
4. **Flexibility**: Active NPC changes who responds, not where messages go
5. **Extensibility**: Foundation for multi-NPC and advanced features
6. **Debugging**: All messages in one session = easier to trace

This corrected implementation creates a cohesive narrative experience where the world exploration is one continuous story, with rooms as chapters and NPCs as dynamic characters that enter and exit the scene.
