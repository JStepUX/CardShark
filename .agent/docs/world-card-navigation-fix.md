# Fix: World Card Navigation Context Issue

## Problem
When navigating to different rooms in a World Card (e.g., from the starting area to "Staff Cabins"), the LLM was not aware of the location change. It would respond as if the player was still at the starting location because the character card's scenario/description was not being updated to reflect the current room.

## Root Cause
The `characterData` from `CharacterContext` was being passed directly to `PromptHandler.generateChatResponse()` without any modification. For World Cards, this meant the LLM always received the original world description in the `memory` context, regardless of which room the player had navigated to.

## Solution
Implemented a **character data override mechanism** that allows `WorldPlayView` to inject current room context into the character card before it's sent to the LLM.

### Changes Made

1. **Created `worldCardAdapter.ts`** (`frontend/src/utils/worldCardAdapter.ts`)
   - New utility function `injectRoomContext()` that modifies a world card's scenario to include current room information
   - Prepends the current room name, description, and introduction text to the scenario

2. **Enhanced `ChatContext.tsx`** (`frontend/src/contexts/ChatContext.tsx`)
   - Added `characterDataOverride` state to allow temporary character data replacement
   - Added `setCharacterDataOverride()` function to the context API
   - Modified `generateResponse()`, `regenerateMessage()`, and `continueResponse()` to use `effectiveCharacterData = characterDataOverride || characterData`
   - Added `CharacterCard` import from schema types

3. **Updated `WorldPlayView.tsx`** (`frontend/src/views/WorldPlayView.tsx`)
   - Added `useCharacter()` hook to access world card data
   - Added `setCharacterDataOverride` from `useChat()` hook
   - Imported `injectRoomContext` utility
   - Added `useEffect` that runs whenever `currentRoom` changes:
     - Calls `injectRoomContext()` to create a modified character card with current room info
     - Calls `setCharacterDataOverride()` to inject the modified card into the chat context
     - Clears the override when no room is set

## How It Works

1. When the player navigates to a new room in `WorldPlayView`:
   - The `currentRoom` state is updated
   - The `useEffect` hook detects the change
   - `injectRoomContext()` creates a modified version of the world card with the current room's information injected into the scenario
   - `setCharacterDataOverride()` stores this modified card in the chat context

2. When the user sends a message:
   - `ChatContext.generateResponse()` uses `effectiveCharacterData = characterDataOverride || characterData`
   - The modified character card (with current room context) is passed to `PromptHandler.generateChatResponse()`
   - The LLM receives the updated scenario in the `memory` context
   - The LLM now knows the player is at "Staff Cabins" (or wherever they navigated to)

## Example

**Before Fix:**
- Player navigates to "Staff Cabins"
- Player says "Hello?"
- LLM receives: `scenario: "You are at the starting point associated with Camp Cookamunga..."`
- LLM responds as if player is still at the starting area

**After Fix:**
- Player navigates to "Staff Cabins"  
- `useEffect` injects room context
- Player says "Hello?"
- LLM receives: `scenario: "You are at the Staff Cabins associated with Camp Cookamunga. Staff cabins are nestled apart from the main camper area, offering more privacy..."`
- LLM responds appropriately for the Staff Cabins location

## Testing
To verify the fix works:
1. Load a World Card
2. Navigate to a different room using the map
3. Send a message to the LLM
4. Check the "API Context Window / Raw Data" in ChatView
5. Verify the `memory` field contains the current room's information

## Future Enhancements
- Consider also injecting NPC context when an NPC is active
- Add room transition history to provide continuity
- Optimize to only update when room actually changes (already handled by useEffect dependencies)
