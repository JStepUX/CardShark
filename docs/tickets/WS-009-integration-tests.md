# WS-009: Add Integration Tests for World Data Flow

**Priority**: P3 (Low)  
**Effort**: High (6-8 hours)  
**Category**: Testing  

## Problem

The World Card system has complex data flows between:
- World Cards → Room Cards → Character Cards
- Frontend types → API → Backend models → PNG storage

There are no integration tests to verify:
1. Round-trip data integrity (create → save → load)
2. Cascade operations (room deletion → world update)
3. Type conversions work correctly
4. PNG metadata embedding and extraction

## Current Test State

Backend has some unit tests but no integration tests for the world system:
```bash
ls backend/tests/
# test_world_endpoints.py exists but may be outdated
```

Frontend has no tests for world components.

## Proposed Test Coverage

### Backend Integration Tests

#### Test: World Card Round-Trip
```python
# tests/integration/test_world_roundtrip.py

async def test_world_create_load_roundtrip():
    """Create a world, save it, reload it, verify all data matches."""
    # Create
    world_data = CreateWorldRequest(
        name="Test World",
        description="Test description",
        grid_size=GridSize(width=5, height=5)
    )
    world = await handler.create_world_card(world_data)
    
    # Load
    loaded = await handler.get_world_card(world.uuid)
    
    # Verify
    assert loaded.data.name == "Test World"
    assert loaded.data.extensions.world_data.grid_size.width == 5
    assert loaded.data.extensions.world_data.rooms == []

async def test_world_with_rooms_roundtrip():
    """Create a world, add rooms, reload, verify structure."""
    # Create world
    world = await world_handler.create_world_card(...)
    
    # Create room
    room = await room_handler.create_room_card(...)
    
    # Add room to world
    await world_handler.update_world_card(world.uuid, UpdateWorldRequest(
        rooms=[WorldRoomPlacement(room_uuid=room.uuid, grid_position=Position(x=2, y=3))]
    ))
    
    # Reload
    loaded = await world_handler.get_world_card(world.uuid)
    
    # Verify
    assert len(loaded.data.extensions.world_data.rooms) == 1
    assert loaded.data.extensions.world_data.rooms[0].room_uuid == room.uuid
    assert loaded.data.extensions.world_data.rooms[0].grid_position.x == 2
```

#### Test: Room with NPCs
```python
async def test_room_with_npcs():
    """Create a room with NPCs, verify they load correctly."""
    # Create character
    char_uuid = await character_service.create_character(...)
    
    # Create room with NPC
    room = await room_handler.create_room_card(CreateRoomRequest(name="Test"))
    await room_handler.update_room_card(room.uuid, UpdateRoomRequest(
        npcs=[RoomNPC(character_uuid=char_uuid, role="shopkeeper")]
    ))
    
    # Load
    loaded = await room_handler.get_room_card(room.uuid)
    
    # Verify
    assert len(loaded.data.extensions.room_data.npcs) == 1
    assert loaded.data.extensions.room_data.npcs[0].character_uuid == char_uuid
    assert loaded.data.extensions.room_data.npcs[0].role == "shopkeeper"
```

#### Test: Room Deletion Cascade
```python
async def test_room_deletion_removes_from_world():
    """When a room is deleted, it should be removed from referencing worlds."""
    # Setup
    world = await world_handler.create_world_card(...)
    room = await room_handler.create_room_card(...)
    await world_handler.update_world_card(world.uuid, UpdateWorldRequest(
        rooms=[WorldRoomPlacement(room_uuid=room.uuid, grid_position=Position(x=0, y=0))]
    ))
    
    # Delete room
    await room_handler.delete_room_card(room.uuid)
    
    # Verify world updated
    loaded = await world_handler.get_world_card(world.uuid)
    assert len(loaded.data.extensions.world_data.rooms) == 0
```

### Frontend Integration Tests (Playwright)

#### Test: World Editor Flow
```typescript
// tests/e2e/world-editor.spec.ts

test('create world and add rooms', async ({ page }) => {
  // Navigate to world creation
  await page.goto('/worlds/new');
  
  // Fill form
  await page.fill('[name="name"]', 'Test World');
  await page.fill('[name="description"]', 'Test description');
  await page.click('[data-testid="create-world"]');
  
  // Wait for editor
  await page.waitForSelector('[data-testid="grid-canvas"]');
  
  // Click empty cell
  await page.click('[data-testid="cell-2-3"]');
  
  // Create new room
  await page.click('[data-testid="create-new-room"]');
  
  // Verify room appears
  await expect(page.locator('[data-testid="cell-2-3"] .room-marker')).toBeVisible();
});

test('navigate between rooms in play mode', async ({ page }) => {
  // Setup: Create world with 2 rooms via API
  const worldId = await createTestWorld();
  
  // Navigate to play mode
  await page.goto(`/play/world/${worldId}`);
  
  // Verify initial room
  await expect(page.locator('[data-testid="current-room-name"]')).toHaveText('Starting Room');
  
  // Open map
  await page.click('[data-testid="open-map"]');
  
  // Click second room
  await page.click('[data-testid="room-second-room"]');
  
  // Verify navigation
  await expect(page.locator('[data-testid="current-room-name"]')).toHaveText('Second Room');
});
```

### API Contract Tests

```typescript
// tests/api/room-api.spec.ts

test('room API returns expected shape', async () => {
  const response = await fetch('/api/room-cards');
  const data = await response.json();
  
  expect(data).toHaveProperty('items');
  expect(Array.isArray(data.items)).toBe(true);
  
  if (data.items.length > 0) {
    const room = data.items[0];
    expect(room).toHaveProperty('uuid');
    expect(room).toHaveProperty('name');
    expect(room).toHaveProperty('description');
  }
});

test('world API returns expected shape', async () => {
  const worldId = 'test-uuid';
  const response = await fetch(`/api/world-cards-v2/${worldId}`);
  const data = await response.json();
  
  expect(data.data.world).toHaveProperty('spec', 'chara_card_v2');
  expect(data.data.world.data.extensions).toHaveProperty('card_type', 'world');
  expect(data.data.world.data.extensions.world_data).toHaveProperty('rooms');
  expect(data.data.world.data.extensions.world_data).toHaveProperty('grid_size');
});
```

## Test Setup Requirements

### Backend
```python
# tests/conftest.py

@pytest.fixture
async def test_db():
    """Provide isolated test database."""
    # Use temp SQLite or in-memory DB
    db = create_test_database()
    yield db
    db.cleanup()

@pytest.fixture
async def room_handler(test_db):
    """Provide RoomCardHandler with test dependencies."""
    return RoomCardHandler(
        character_service=CharacterService(test_db),
        png_handler=PngMetadataHandler(),
        settings_manager=TestSettingsManager(),
        logger=NullLogger()
    )
```

### Frontend
```typescript
// tests/setup.ts

beforeAll(async () => {
  // Start test server
  await startTestServer();
});

afterEach(async () => {
  // Clean up test data
  await cleanupTestWorld();
});
```

## Acceptance Criteria

- [ ] Backend integration tests for world/room CRUD
- [ ] Backend integration tests for cascade operations
- [ ] Frontend E2E tests for World Editor flow
- [ ] Frontend E2E tests for World Play flow
- [ ] API contract tests validate response shapes
- [ ] Tests can run in CI/CD pipeline
- [ ] Test coverage > 80% for world system code

## Files to Create

```
backend/tests/integration/
├── conftest.py
├── test_world_roundtrip.py
├── test_room_roundtrip.py
└── test_cascade_operations.py

frontend/tests/e2e/
├── world-editor.spec.ts
├── world-play.spec.ts
└── room-editor.spec.ts

frontend/tests/api/
├── room-api.spec.ts
└── world-api.spec.ts
```

## Notes

This is a P3 ticket because the system works without tests, but tests would:
- Catch regressions during refactoring
- Document expected behavior
- Enable confident AI-assisted changes
- Reduce manual testing time
