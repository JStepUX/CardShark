# World Card V2 Architecture

> This document describes the V2 World/Room Card system introduced in PR #15.
> Last updated: 2024-12-29

## Overview

CardShark uses a **PNG-embedded metadata** approach for storing character, room, and world data. All card types follow the `chara_card_v2` specification with type-specific extensions.

## Card Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    chara_card_v2 Specification                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  Character   │   │    Room      │   │    World     │        │
│  │    Card      │   │    Card      │   │    Card      │        │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤        │
│  │ card_type:   │   │ card_type:   │   │ card_type:   │        │
│  │ (undefined)  │   │ "room"       │   │ "world"      │        │
│  │              │   │              │   │              │        │
│  │ Standard     │   │ room_data:   │   │ world_data:  │        │
│  │ character    │   │ - uuid       │   │ - uuid       │        │
│  │ fields       │   │ - npcs[]     │   │ - grid_size  │        │
│  │              │   │              │   │ - rooms[]    │        │
│  │              │   │              │   │ - positions  │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                            │                   │                 │
│                            │    References     │                 │
│                            ◄───────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Storage Format

All cards are stored as **PNG files** with JSON metadata embedded in the `tEXt` chunk:

```
characters/
├── alice.png          # Character card
├── bob.png            # Character card  
└── rooms/
    ├── tavern.png     # Room card (card_type="room")
    └── forest.png     # Room card
    
worlds/
└── fantasy_realm.png  # World card (card_type="world")
```

## Data Structures

### Character Card (Base)
```typescript
interface CharacterCard {
  spec: "chara_card_v2";
  spec_version: string;
  data: {
    name: string;
    description: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    system_prompt?: string;
    character_book?: { entries: LoreEntry[] };
    extensions: Record<string, any>;
    // ... other standard fields
  };
}
```

### Room Card
```typescript
// Extends CharacterCard with card_type="room"
interface RoomCard extends CharacterCard {
  data: {
    // ... standard fields used for room properties
    extensions: {
      card_type: "room";
      room_data: {
        uuid: string;
        npcs: RoomNPC[];  // Characters assigned to this room
      };
    };
  };
}

interface RoomNPC {
  character_uuid: string;  // References a CharacterCard
  role?: string;           // e.g., "shopkeeper", "guard"
  hostile?: boolean;
}
```

### World Card
```typescript
// Extends CharacterCard with card_type="world"
interface WorldCard extends CharacterCard {
  data: {
    // ... standard fields used for world metadata
    extensions: {
      card_type: "world";
      world_data: {
        uuid: string;
        grid_size: { width: number; height: number };
        rooms: WorldRoomPlacement[];  // Room positions on grid
        starting_position: { x: number; y: number };
        player_position: { x: number; y: number };
      };
    };
  };
}

interface WorldRoomPlacement {
  room_uuid: string;                    // References a RoomCard
  grid_position: { x: number; y: number };
}
```

## Data Flow

### World Editing Flow
```
User opens WorldEditor
        │
        ▼
worldApi.getWorld(uuid)
        │
        ▼
Load WorldCard from PNG ──────────────────┐
        │                                  │
        ▼                                  │
For each room in world_data.rooms:        │
        │                                  │
        ▼                                  │
roomApi.getRoom(room_uuid) ◄──────────────┘
        │
        ▼
Convert RoomCard → GridRoom (view layer)
        │
        ▼
Display in GridCanvas
```

### World Play Flow
```
User starts WorldPlayView
        │
        ▼
Load WorldCard
        │
        ▼
Load all RoomCards
        │
        ▼
Build GridWorldState for MapModal
        │
        ▼
Find current room by player_position
        │
        ▼
injectRoomContext() ────────────────┐
        │                           │
        ▼                           │
Modify CharacterCard.scenario       │
to include room description         │
        │                           │
        ▼                           │
ChatView uses modified card ◄───────┘
for LLM context
```

### Context Injection (for LLM)
```typescript
// worldCardAdapter.ts

// When player is in a room, the world's scenario field is modified:
modifiedCard.data.scenario = `
  You are at the ${currentRoom.name}. ${currentRoom.description}
  ${currentRoom.introduction_text}
  
  ${originalScenario}
`;

// When talking to an NPC, additional layering:
// 1. World context (world.system_prompt)
// 2. Room context (room.description)
// 3. NPC context (npc.scenario, npc.personality)
```

## Key Files Reference

### Frontend Types
| File | Purpose |
|------|---------|
| `types/room.ts` | RoomCard, RoomNPC, CreateRoomRequest, UpdateRoomRequest |
| `types/worldCard.ts` | WorldCard, WorldRoomPlacement, WorldData |
| `types/worldV2.ts` | WorldState, Room, PlayerState (runtime schema) |
| `types/world.ts` | Legacy types (NarratorVoice, TimeSystem, etc.) |
| `utils/worldStateApi.ts` | GridRoom, GridWorldState (view layer types) |

### Frontend API Clients
| File | Endpoints |
|------|-----------|
| `api/roomApi.ts` | `/api/room-cards/*` |
| `api/worldApi.ts` | `/api/world-cards-v2/*` |

### Frontend Views & Components
| File | Purpose |
|------|---------|
| `views/WorldEditor.tsx` | Grid-based world builder |
| `views/WorldPlayView.tsx` | Gameplay orchestrator with chat |
| `components/RoomEditor.tsx` | Room card property editor |
| `components/world/GridCanvas.tsx` | Grid visualization |
| `components/world/RoomPropertiesPanel.tsx` | Inline room editing |
| `components/world/MapModal.tsx` | Navigation modal |

### Frontend Utilities
| File | Purpose |
|------|---------|
| `utils/worldCardAdapter.ts` | Context injection for LLM |
| `utils/worldStateApi.ts` | Type adapters and NPC resolution |

### Backend Models
| File | Purpose |
|------|---------|
| `models/room_card.py` | Pydantic models for RoomCard |
| `models/world_card.py` | Pydantic models for WorldCard |
| `models/world_state.py` | Pydantic models for WorldState |
| `models/world_data.py` | Legacy world data structures |

### Backend Handlers
| File | Purpose |
|------|---------|
| `handlers/room_card_handler.py` | Room CRUD operations |
| `handlers/world_card_handler_v2.py` | World CRUD operations |
| `handlers/world_card_chat_handler.py` | World-aware chat generation |

## Common Operations

### Creating a New Room
```typescript
// 1. Call API
const roomSummary = await roomApi.createRoom({
  name: "New Room",
  description: "A mysterious chamber",
});

// 2. API creates PNG with embedded metadata
// 3. Returns RoomCardSummary with uuid
```

### Adding Room to World
```typescript
// 1. Get current world
const world = await worldApi.getWorld(worldId);

// 2. Add room placement
const newPlacement: WorldRoomPlacement = {
  room_uuid: roomSummary.uuid,
  grid_position: { x: 5, y: 3 },
};

// 3. Update world
await worldApi.updateWorld(worldId, {
  rooms: [...world.data.extensions.world_data.rooms, newPlacement],
});
```

### Navigating Between Rooms
```typescript
// 1. User clicks room on map
// 2. Update player_position in world state
await worldApi.updateWorld(worldId, {
  player_position: targetRoom.position,
});

// 3. Load new room's NPCs
const npcs = await resolveNpcDisplayData(targetRoom.npcs);

// 4. Inject new room context for LLM
const modifiedCard = injectRoomContext(worldCard, targetRoom);
setCharacterDataOverride(modifiedCard);
```

## Known Limitations

1. **Room connections not fully implemented** - Grid position determines adjacency
2. **No room events system** - Events array exists but unused
3. **Single player position** - World state doesn't support multiplayer
4. **No room deletion cascade** - Deleting a room doesn't update worlds referencing it

## Related Documentation

- See tickets in `docs/tickets/` for planned improvements
- Character Card V2 Spec: https://github.com/malfoyslastname/character-card-spec-v2
