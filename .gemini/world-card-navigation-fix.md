# World Card Navigation Fix

## Issues Resolved

### Issue 1: World Side Panel Not Showing
**Problem**: When selecting a World card from the gallery, the WorldSidePanel component was not displaying.

**Root Cause**: The `handleCharacterClick` function in `CharacterGallery.tsx` was navigating all cards (both Character and World types) to the `/chat` route, which loads `ChatView`. However, `WorldPlayView` (which contains the `WorldSidePanel`) is only accessible via the `/world/{uuid}/play` route.

**Solution**: Updated `selectCharacter` function to intelligently route based on card type:
- **World cards** → `/world/{uuid}/play` (loads WorldPlayView with WorldSidePanel)
- **Regular characters** → `/chat` (loads ChatView)
- **Incomplete cards** → `/info` (loads CharacterInfoView for setup)

### Issue 2: World Launcher Not Loading Character Data
**Problem**: Clicking "Basic Info & Greetings" (info icon) on a World card navigated to the World Launcher but didn't load the character data into `CharacterContext` first.

**Root Cause**: The `handleInfoIconClick` function was directly calling `navigate()` without first loading the character metadata, meaning the World Launcher view had no access to the card's data.

**Solution**: Changed `handleInfoIconClick` to be async and call `selectCharacter` with the target route, ensuring character data is loaded into context before navigation occurs.

## Code Changes

### File: `frontend/src/components/character/CharacterGallery.tsx`

#### 1. Enhanced `selectCharacter` function (lines 519-589)
Added intelligent routing logic that checks card type:
```typescript
// Default navigation based on card type and state
const isWorldCard = character.extensions?.card_type === 'world';

if (isWorldCard && character.character_uuid) {
  // World cards navigate to World Play view
  navigate(`/world/${character.character_uuid}/play`);
} else if (character.is_incomplete) {
  // Incomplete characters go to info/setup
  navigate('/info');
} else {
  // Regular characters go to chat
  navigate('/chat');
}
```

#### 2. Updated `handleInfoIconClick` (lines 600-613)
Changed to async function that loads data before navigation:
```typescript
const handleInfoIconClick = async (event: React.MouseEvent, character: CharacterFile) => {
  event.stopPropagation();

  if (character.extensions?.card_type === 'world' && character.character_uuid) {
    // Load character data into context before navigating to launcher
    await selectCharacter(character, `/world/${character.character_uuid}/launcher`, true);
  } else {
    selectCharacter(character, '/info', true);
  }
};
```

## Architecture Overview

### Routing Flow for World Cards

**Gallery Click (Main):**
1. User clicks World card in gallery
2. `handleCharacterClick` → `selectCharacter`
3. Character data loaded into `CharacterContext`
4. Navigate to `/world/{uuid}/play`
5. `WorldPlayView` renders with `WorldSidePanel` visible

**Info Icon Click:**
1. User clicks info icon on World card
2. `handleInfoIconClick` → `selectCharacter` (with target route)
3. Character data loaded into `CharacterContext`
4. Navigate to `/world/{uuid}/launcher`
5. `WorldLauncher` renders with access to card metadata

### Routing Flow for Character Cards

**Gallery Click (Main):**
1. User clicks Character card in gallery
2. `handleCharacterClick` → `selectCharacter`
3. Character data loaded into `CharacterContext`
4. Navigate to `/chat` (or `/info` if incomplete)
5. `ChatView` renders

**Info Icon Click:**
1. User clicks info icon on Character card
2. `handleInfoIconClick` → `selectCharacter` (with `/info` route)
3. Character data loaded into `CharacterContext`
4. Navigate to `/info`
5. `CharacterInfoView` renders

## Benefits

1. **Code Reuse**: The `selectCharacter` function is reused for all navigation scenarios, ensuring consistent data loading
2. **Type Safety**: Proper routing based on `card_type` extension field
3. **Context Integrity**: All routes now receive properly loaded character data via `CharacterContext`
4. **Separation of Concerns**: World and Character cards now use their dedicated UI views

## Testing Checklist

- [ ] World card selected from gallery → WorldPlayView loads with WorldSidePanel visible
- [ ] World card info icon → WorldLauncher loads with card metadata accessible
- [ ] Character card selected from gallery → ChatView loads
- [ ] Character card info icon → CharacterInfoView loads
- [ ] Incomplete character card → CharacterInfoView loads for setup
- [ ] Character data is available in all target views via `useCharacter()` hook
