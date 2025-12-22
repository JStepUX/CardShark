# Character Duplication Feature & Toolbar Reorganization

## Summary
Added a "Duplicate Character" feature and reorganized the Basic Info & Greetings toolbar to be more manageable using an overflow menu pattern.

## Changes Made

### 1. Backend (Already Existed)
- **Endpoint**: `POST /api/character/{character_uuid}/duplicate`
- **Service**: `CharacterService.duplicate_character()`
- The backend already had full support for character duplication with fresh UUID generation

### 2. Frontend Updates

#### File: `frontend/src/components/character/CharacterInfoView.tsx`

**New Imports:**
- Added `MoreVertical` and `Copy` icons from lucide-react

**New State:**
- `showOverflowMenu`: Controls visibility of the overflow dropdown
- `overflowMenuRef`: Reference for click-outside detection

**New Handlers:**
- `handleDuplicate()`: Calls the backend duplicate endpoint, invalidates cache, and navigates to the new character
- Click-outside effect to close the overflow menu when clicking elsewhere

**Toolbar Reorganization:**

**Before:**
- Delete (standalone)
- Compare (standalone)
- Convert to World (standalone)
- Find & Replace (standalone)
- JSON View (standalone)

**After:**
- **Compare** (standalone - frequently used)
- **Find & Replace** (standalone - frequently used)
- **JSON View** (standalone - frequently used)
- **Overflow Menu** (⋮) containing:
  - **Duplicate Character** (new!)
  - **Convert to World**
  - **Delete Character** (separated with divider, shown in red)

## User Experience

### Duplicating a Character:
1. Open a character in Basic Info & Greetings
2. Click the overflow menu button (⋮)
3. Click "Duplicate Character"
4. A new character is created with name "{Original Name} (Copy)" and a fresh UUID
5. The gallery cache is invalidated
6. User is automatically navigated to the duplicated character

### Benefits:
- **Cleaner UI**: Reduced button clutter in the toolbar
- **Logical Grouping**: Destructive/transformative actions are grouped together
- **Fresh UUIDs**: No more UNIQUE constraint errors when manually copying
- **Better UX**: Frequently-used actions (Compare, Find & Replace, JSON) remain easily accessible

## Technical Details

### Duplicate API Call:
```typescript
POST /api/character/{character_uuid}/duplicate
Body: { "new_name": "{Original Name} (Copy)" }
```

### Response:
```json
{
  "success": true,
  "data": {
    "character": { ... },
    "message": "Character duplicated successfully as '{name}'"
  }
}
```

### Error Handling:
- Displays user-friendly alerts on failure
- Properly closes the overflow menu
- Handles missing character_uuid gracefully
