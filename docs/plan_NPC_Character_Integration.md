# NPC Character Card Integration for World System

**Status**: Planning  
**Created**: 2026-01-24  
**Related**: World Cards V2, Character Card V2 Spec

---

## Overview

This document outlines the strategy for integrating character cards as NPCs into the world system while preserving character portability, managing context efficiently, and avoiding character duplication across multiple worlds.

## Problem Statement

### Current Challenges

1. **Baked-in Scenarios**: Many character cards have world-specific details embedded in their `description` field that conflict with our world system
2. **Full Card Loading**: Currently loading complete character cards for all NPCs in a room, even if never interacted with
3. **Character Duplication**: No linkage system - same character added to multiple worlds creates duplicate data
4. **Context Bloat**: Full character descriptions pollute world narrator context when NPCs are just "present" in a room

### Success Criteria

- ✅ Character essence preserved across different worlds
- ✅ Minimal memory footprint for non-active NPCs
- ✅ Single source of truth for character data
- ✅ World-specific overrides without duplicating base character
- ✅ Fast room loading with many NPCs

---

## Architecture

### 1. Character-World Linkage System

**Concept**: Characters exist as standalone entities, worlds reference them with instance-specific overrides.

```typescript
// Base character card (single source of truth)
interface CharacterCard {
  data: {
    character_uuid: string;
    name: string;
    description: string;      // Full personality, appearance, traits
    scenario: string;          // Original scenario (may conflict with world)
    first_mes: string;         // Original greeting (location-specific)
    // ... other V2 fields
    
    // NEW: Portability metadata
    synopsis?: string;         // 1-2 sentence summary for thin frames
    portability_score?: number; // 0-100, auto-calculated
  }
}

// World-specific NPC instance (lightweight reference)
interface WorldNPCInstance {
  character_uuid: string;      // Links to base CharacterCard
  instance_id: string;         // Unique per world placement
  
  // Instance-specific overrides
  display_name?: string;       // Override name if needed
  world_backstory?: string;    // How they fit into THIS world
  hostile?: boolean;
  monster_level?: number;
  
  // Placement data
  room_uuid: string;
  grid_position?: { x: number; y: number };
}
```

**Benefits**:
- Edit character once, updates across all worlds
- World-specific customization without duplication
- Clear separation of "who they are" vs "where they are"

---

### 2. Thin Frame Loading

**Concept**: Load minimal NPC data on room entry, full data only on interaction.

#### Phase 1: Room Entry (Thin Frames)

```typescript
interface NPCThinFrame {
  id: string;                  // character_uuid
  name: string;
  synopsis: string;            // "A gruff tavern keeper with a mysterious past"
  imageUrl?: string;
  hostile?: boolean;
  monster_level?: number;
}
```

**API Endpoint**: `GET /api/characters/thin-frames?uuids=uuid1,uuid2,uuid3`

Returns only: `character_uuid`, `name`, `synopsis`, `avatar` path, no full description/scenario.

#### Phase 2: NPC Interaction (Full Load)

When player clicks NPC:
1. Fetch full `CharacterCard` via existing `/api/character/{uuid}`
2. Apply `injectNPCContext()` to strip conflicting fields
3. Inject world + room context into `scenario`
4. Generate contextual greeting

**Performance Impact**:
- Room with 10 NPCs: ~2KB thin frames vs ~200KB full cards
- 100x reduction in initial load size
- Lazy loading only what's needed

---

### 3. Character Portability Analysis

**Concept**: Auto-score character cards on how well they'll adapt to different worlds.

#### Portability Scoring Algorithm

```typescript
interface PortabilityAnalysis {
  score: number;              // 0-100
  issues: PortabilityIssue[];
  recommendations: string[];
}

interface PortabilityIssue {
  severity: 'low' | 'medium' | 'high';
  field: string;              // 'description' | 'scenario' | 'first_mes'
  issue: string;              // Description of the problem
  excerpt: string;            // Problematic text snippet
}
```

**Scoring Criteria**:

| Factor | Weight | Good Example | Bad Example |
|--------|--------|--------------|-------------|
| **Location-agnostic description** | 30% | "A sheep demihuman farmhand" | "The owner of Starfruit Farms in the kingdom of X" |
| **Portable background** | 25% | "Grew up in a farming community" | "Born in the capital city of Aethermoor" |
| **Generic scenario field** | 20% | Empty or world-injected | "You are in the throne room of King Aldric" |
| **No hardcoded locations** | 15% | "works on farms" | "never leaves the tavern in Millhaven" |
| **Adaptable relationships** | 10% | "loyal to those she trusts" | "sworn enemy of Lord Blackwood" |

**Implementation**:
- Run on character import/edit
- Use LLM or regex patterns to detect location-specific language
- Display score in character editor UI
- Suggest improvements for low scores

#### Example Analysis

**High Portability (Score: 92)**
```
✅ Description focuses on traits, not locations
✅ Background mentions "a farming community" (generic)
✅ No hardcoded place names in personality
⚠️ Minor: Mentions "Starfruit Farms" in background (low severity)
```

**Low Portability (Score: 34)**
```
❌ Description: "The royal advisor to King Aldric of Havenrook"
❌ Scenario: "You are in the throne room discussing the war"
❌ First message: References specific kingdom politics
💡 Recommendation: Rewrite as "A royal advisor experienced in court politics"
```

---

### 4. Context Injection Strategy

**Current Implementation** (`worldCardAdapter.ts`):
- `injectRoomContext()`: World narrator mode
- `injectNPCContext()`: NPC conversation mode

**Enhancement for Thin Frames**:

```typescript
// NEW: Build room context with NPC synopses (not full descriptions)
function buildRoomContextWithNPCs(
  worldCard: CharacterCard,
  currentRoom: GridRoom,
  npcThinFrames: NPCThinFrame[]
): string {
  const npcPresence = npcThinFrames.length > 0
    ? `\n\nPresent in this location:\n${npcThinFrames.map(npc => 
        `- ${npc.name}: ${npc.synopsis}`
      ).join('\n')}`
    : '';
  
  return `
[Current Location: ${currentRoom.name}]
${currentRoom.description}

${currentRoom.introduction_text || ''}
${npcPresence}

${worldCard.data.scenario || ''}
  `.trim();
}
```

**Benefits**:
- World narrator knows NPCs are present without full backstories
- Player can ask "who's here?" and get accurate responses
- Minimal context pollution

---

## User Experience Flow

### Adding an NPC to a World

1. **World Editor**: User clicks "Add NPC" in room
2. **Character Picker**: Shows all characters with portability scores
   - 🟢 High (80-100): "Highly portable - will adapt well"
   - 🟡 Medium (50-79): "May need tweaking - review recommended"
   - 🔴 Low (0-49): "World-specific - may conflict"
3. **Preview & Customize** (optional):
   - Show how character will appear in this world
   - Option to add world-specific backstory
   - Override display name if needed
4. **Confirm**: Creates `WorldNPCInstance` link (not duplicate)

### Editing a Character

**Scenario A: Edit from Character Library**
- Changes apply to base `CharacterCard`
- Updates reflected in ALL worlds using this character
- UI warning: "This character is used in 3 worlds"

**Scenario B: Edit from World Editor** (future enhancement)
- Option to edit base character OR create world-specific override
- Override only affects this world instance
- Clear visual indicator of overridden fields

---

## Implementation Phases

### Phase 1: Thin Frame Loading (Immediate Value)
- [ ] Add `synopsis` field to `CharacterCard` schema
- [ ] Create `GET /api/characters/thin-frames` endpoint
- [ ] Update `WorldPlayView` to use thin frames on room load
- [ ] Modify `buildRoomContext()` to use synopses
- [ ] Full card load only on NPC interaction

**Estimated Impact**: 10x faster room loading, 100x less memory

### Phase 2: Portability Analysis (Quality Improvement)
- [ ] Implement portability scoring algorithm
- [ ] Add score display to character editor
- [ ] Show portability badges in NPC picker
- [ ] Generate improvement suggestions

**Estimated Impact**: Better character quality, fewer world conflicts

### Phase 3: Character-World Linkage (Data Architecture)
- [ ] Create `WorldNPCInstance` schema
- [ ] Migrate existing world NPCs to linkage system
- [ ] Add world-specific override UI
- [ ] Implement "edit base vs override" flow

**Estimated Impact**: Eliminate duplication, single source of truth

### Phase 4: Synopsis Auto-Generation (Polish)
- [ ] LLM-powered synopsis generation from full description
- [ ] Batch process existing characters
- [ ] Auto-generate on character creation if empty

**Estimated Impact**: Seamless adoption, no manual synopsis writing

---

## Technical Considerations

### Database Schema Changes

```sql
-- Add synopsis to character cards
ALTER TABLE character_cards ADD COLUMN synopsis TEXT;
ALTER TABLE character_cards ADD COLUMN portability_score INTEGER;

-- New table for world-NPC linkage (future)
CREATE TABLE world_npc_instances (
  instance_id TEXT PRIMARY KEY,
  character_uuid TEXT REFERENCES character_cards(uuid),
  world_uuid TEXT REFERENCES character_cards(uuid),
  room_uuid TEXT,
  display_name TEXT,
  world_backstory TEXT,
  hostile BOOLEAN DEFAULT FALSE,
  monster_level INTEGER,
  grid_position_x INTEGER,
  grid_position_y INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API Changes

**New Endpoints**:
- `GET /api/characters/thin-frames?uuids=...` - Batch fetch synopses
- `POST /api/characters/{uuid}/analyze-portability` - Get portability score
- `POST /api/characters/{uuid}/generate-synopsis` - Auto-generate synopsis

**Modified Endpoints**:
- `GET /api/character/{uuid}` - Include `synopsis` and `portability_score` in response

### Frontend Changes

**New Components**:
- `PortabilityBadge.tsx` - Visual indicator (🟢🟡🔴)
- `CharacterPortabilityPanel.tsx` - Detailed analysis view
- `NPCInstanceEditor.tsx` - Edit world-specific overrides

**Modified Components**:
- `NPCPickerModal.tsx` - Show portability scores
- `WorldPlayView.tsx` - Use thin frame loading
- `CharacterEditor.tsx` - Display portability analysis

---

## Open Questions

1. **Synopsis Generation**: Manual entry or auto-generate with LLM?
   - **Recommendation**: Auto-generate with manual override option

2. **Portability Threshold**: What score should trigger warnings?
   - **Recommendation**: 50+ = acceptable, <50 = show warning

3. **World-Specific Overrides**: Edit in-place or separate UI?
   - **Recommendation**: Separate "Instance Settings" panel to avoid confusion

4. **Migration Strategy**: How to handle existing world NPCs?
   - **Recommendation**: Lazy migration - convert on first edit or world load

5. **Conflict Resolution**: What if base character edited breaks world instance?
   - **Recommendation**: World-specific overrides take precedence, show diff in UI

---

## Success Metrics

**Performance**:
- Room load time with 10 NPCs: <500ms (currently ~2s)
- Memory usage for inactive NPCs: <1KB each (currently ~20KB)

**Quality**:
- Average portability score of new characters: >70
- User-reported world conflicts: <5% of NPC additions

**Adoption**:
- 80%+ of characters have synopses within 3 months
- 50%+ reduction in duplicate character cards

---

## References

- [Character Card V2 Spec](https://github.com/malfoyslastname/character-card-spec-v2)
- [worldCardAdapter.ts](file:///d:/Bolt-On/cardshark/frontend/src/utils/worldCardAdapter.ts) - Current context injection
- [WorldPlayView.tsx](file:///d:/Bolt-On/cardshark/frontend/src/views/WorldPlayView.tsx) - Current NPC loading (lines 182-195)
- Clover character analysis - Example of high-portability card structure
