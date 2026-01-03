# Bug Fixes: Hostile NPC Display, Combat Log Scrolling & Player Representation

## Issue 1: Hostile NPCs Visual Differentiation ✅

**Problem:** Hostile NPCs appeared identical to friendly NPCs in the "Present" section of the World Play View, making it difficult for players to identify threats at a glance.

**Solution:** Updated `NPCCard.tsx` to provide clear visual indicators for hostile NPCs:

### Visual Changes:
- **Red Border**: Hostile NPCs now have a red border instead of gray
  - Active hostile NPCs: `border-red-500` with red glow shadow
  - Inactive hostile NPCs: `border-red-600` with hover effect
- **Skull Badge**: Added a small skull icon in the top-right corner of hostile NPC portraits
- **Red Text**: NPC names are displayed in red (`text-red-400`) for hostile NPCs
- **Red Ring**: When selected, hostile NPCs show a red ring instead of blue

### Technical Details:
- Extended `NPCCardProps` interface to accept `hostile` and `monster_level` properties
- Added conditional styling based on `npc.hostile` flag
- Imported `Skull` icon from `lucide-react`
- Maintained backward compatibility with non-hostile NPCs

**File Modified:** `frontend/src/components/world/NPCCard.tsx`

---

## Issue 2: Combat Log Scrolling ✅

**Problem:** During combat, each new turn entry in the combat log would push the entire screen down, eventually pushing the action buttons (Attack, Overwatch, etc.) off-screen and making them inaccessible.

**Solution:** Fixed the flexbox layout in `CombatModal.tsx` to ensure proper scroll behavior:

### Changes Made:
1. **Initiative Tracker**: Added `flex-shrink-0` to prevent it from shrinking
2. **Combat Log Container**: Changed from `overflow-hidden` to `min-h-0`
   - This is a critical flexbox fix that allows the child to properly scroll
   - `min-h-0` prevents the flex item from expanding beyond its allocated space

### Why This Works:
- In flexbox, children have a default `min-height: auto` which can prevent scrolling
- Setting `min-h-0` (equivalent to `min-height: 0`) allows the flex child to shrink below its content size
- The `overflow-y-auto` in `CombatLog.tsx` can now properly activate when content exceeds the container height
- The action buttons remain fixed at the bottom of the screen

**File Modified:** `frontend/src/components/combat/CombatModal.tsx`

---

## Issue 3: Player Representation in Combat ✅

**Problem:** The player character in combat was represented by the world card's image and name instead of the user's profile, causing confusion about who the player actually is.

**Solution:** Updated `WorldPlayView.tsx` to use the current user's profile data for combat initialization:

### Changes Made:
1. **Import currentUser**: Added `currentUser` to the destructured values from `useChat()` hook
2. **Player Name**: Changed from `characterData?.data?.name` to `currentUser?.name || 'Player'`
3. **Player Image**: Changed from world card image to user profile image:
   - Old: `/api/character-image/${characterData.data.character_uuid}.png`
   - New: `/users/${currentUser.filename}`
   - Falls back to `null` if no user profile is set (combat UI will show generic user icon)

### Benefits:
- Player is now correctly represented as the user, not the world entity
- Uses the user's chosen profile image and name
- Maintains immersion by clearly distinguishing player from NPCs
- Graceful fallback when no user profile is configured

**File Modified:** `frontend/src/views/WorldPlayView.tsx`

---

## Testing Recommendations:

### Hostile NPC Display:
1. Navigate to a world with hostile NPCs
2. Verify hostile NPCs show:
   - Red border around portrait
   - Skull icon badge
   - Red name text
3. Click a hostile NPC and verify it shows a red ring (not blue)
4. Verify friendly NPCs still show blue styling

### Combat Log Scrolling:
1. Enter combat with hostile NPCs
2. Play through multiple turns (10+)
3. Verify the combat log scrolls internally
4. Verify action buttons remain visible at the bottom
5. Verify the screen doesn't push down with new entries

### Player Representation:
1. Set a user profile with a custom name and image
2. Enter combat in a world
3. Verify the player combatant shows:
   - User's profile name (not world name)
   - User's profile image (not world card image)
4. Test with no user profile set - verify fallback to "Player" name and generic icon

---

## Related Files:
- `frontend/src/components/world/NPCCard.tsx` - NPC card display component
- `frontend/src/components/combat/CombatModal.tsx` - Main combat modal container
- `frontend/src/components/combat/CombatLog.tsx` - Combat log display (no changes needed)
- `frontend/src/views/WorldPlayView.tsx` - World play orchestrator (player data fix)
