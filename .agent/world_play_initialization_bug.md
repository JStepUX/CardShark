# World Play Initialization Bug Report

## Issues Reported

1. **First room introduction not showing** - World's `first_mes` appears instead of room's introduction text
2. **NPCs not appearing** - "No one else is here" despite adding NPCs to the room

## Root Cause Analysis

### Issue 1: First Message Problem

**What's happening:**
- When you click "Play World", the `ChatProvider` automatically loads a chat session for the world character
- The `ChatProvider.loadChatForCharacterInternal()` function (line 411-570 in ChatContext.tsx) checks if there's an existing chat
- If no chat exists, it creates a new one with the character's `first_mes` (the world's greeting)
- This happens BEFORE the room introduction is added

**The flow:**
1. User clicks "Play World" → navigates to `/world/:uuid/play`
2. `ChatProvider` wraps `WorldPlayView` (AppRoutes.tsx line 71-76)
3. `CharacterProvider` loads the world card as a character
4. `ChatProvider` detects character change and calls `loadChatForCharacterInternal()`
5. Creates new chat with world's `first_mes` as first message
6. THEN `WorldPlayView.loadWorld()` runs and tries to add room introduction
7. But the world's `first_mes` is already in the chat!

**Why room introduction doesn't show on first load:**
- Looking at `WorldPlayView.tsx` line 502-515, the room introduction is only added during `performRoomTransition()`
- But `performRoomTransition()` is NOT called when initially loading the world
- The initial room load (lines 142-182) sets `currentRoom` and `roomNpcs` but doesn't add an introduction message

### Issue 2: NPCs Not Appearing

**What's happening:**
- NPCs ARE being saved correctly (WorldEditor.tsx line 340)
- NPCs ARE being loaded from the placement data (roomCardAdapter.ts line 52-54, 126)
- The problem is likely in how the initial room is loaded

**Checking the initial load flow:**
1. `WorldPlayView.loadWorld()` runs (line 75-190)
2. Line 94: "This uses cached instance_name and instance_npcs from the world card"
3. Line 105: Creates stub with `placementToGridRoomStub(placement)`
4. Line 126 in roomCardAdapter.ts: `npcs: placement.instance_npcs ? [...placement.instance_npcs] : []`
5. Line 145-146: Fetches full room card and converts with `roomCardToGridRoom(roomCard, playerPos, currentPlacement)`
6. Line 52-54 in roomCardAdapter.ts: Uses `placement?.instance_npcs` if available

**The issue:**
- The placement SHOULD have `instance_npcs` after you save in the editor
- But if the placement doesn't have it, it falls back to the room card's default NPCs
- Need to verify that the placement data actually contains `instance_npcs` after save

## Debugging Steps

1. **Check if NPCs are actually saved:**
   - Open browser dev tools
   - Go to Network tab
   - Click "Play World"
   - Look for the GET request to `/api/worlds/:uuid`
   - Check the response - look at `data.extensions.world_data.rooms[0].instance_npcs`
   - Should contain an array of NPC objects with `character_uuid`, `hostile`, etc.

2. **Check console logs:**
   - Line 174 in WorldPlayView logs: "World loaded: X rooms on map, 1 room fetched (lazy loading)"
   - Check if there are any errors about loading the room
   - Check if `roomNpcs` state is being set correctly

3. **Check if room introduction exists:**
   - The room card's `first_mes` field becomes `introduction_text` in GridRoom
   - If the room card doesn't have a `first_mes`, there won't be an introduction

## Proposed Fixes

### Fix 1: Add Room Introduction on Initial Load

**Location:** `WorldPlayView.tsx` line 142-182

**Current code:**
```typescript
if (currentPlacement) {
  try {
    const roomCard = await roomApi.getRoom(currentPlacement.room_uuid);
    const fullCurrentRoom = roomCardToGridRoom(roomCard, playerPos, currentPlacement);
    
    // ... sets currentRoom and roomNpcs ...
    
  } catch (err) {
    // error handling
  }
}
```

**Proposed fix:**
```typescript
if (currentPlacement) {
  try {
    const roomCard = await roomApi.getRoom(currentPlacement.room_uuid);
    const fullCurrentRoom = roomCardToGridRoom(roomCard, playerPos, currentPlacement);
    
    // ... existing code to set currentRoom and roomNpcs ...
    
    // ADD THIS: Add room introduction as first message
    if (fullCurrentRoom.introduction_text) {
      const roomIntroMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: fullCurrentRoom.introduction_text,
        timestamp: Date.now(),
        metadata: {
          type: 'room_introduction',
          roomId: fullCurrentRoom.id
        }
      };
      
      // Clear any existing messages first (removes world's first_mes)
      setMessages([roomIntroMessage]);
    }
    
  } catch (err) {
    // error handling
  }
}
```

### Fix 2: Prevent ChatProvider from Auto-Loading

**Alternative approach:** Disable auto-load for world play view

**Location:** `AppRoutes.tsx` line 70-77

**Current code:**
```typescript
<Route path="world/:uuid/play" element={
  <ChatProvider>
    <LazyRoute routeName="World Play">
      <HighlightStylesUpdater />
      <WorldPlayView />
    </LazyRoute>
  </ChatProvider>
} />
```

**Proposed fix:**
```typescript
<Route path="world/:uuid/play" element={
  <ChatProvider disableAutoLoad={true}>
    <LazyRoute routeName="World Play">
      <HighlightStylesUpdater />
      <WorldPlayView />
    </LazyRoute>
  </ChatProvider>
} />
```

This prevents the ChatProvider from automatically creating a chat with the world's `first_mes`.

### Fix 3: Debug NPC Loading

Add console logging to verify NPCs are loaded:

**Location:** `WorldPlayView.tsx` after line 169

```typescript
setRoomNpcs(npcsWithCombatData);
console.log('Initial room NPCs loaded:', npcsWithCombatData);
console.log('Placement instance_npcs:', currentPlacement.instance_npcs);
```

## Recommended Solution

**Implement both Fix 1 and Fix 2:**

1. Disable auto-load in ChatProvider for world play
2. Add room introduction message on initial load
3. Add debug logging to verify NPC data

This ensures:
- No world `first_mes` appears
- Room introduction shows on first load
- NPCs are properly loaded and displayed
