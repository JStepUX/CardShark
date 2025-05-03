# World Persistence Strategy for CardShark

This document outlines our strategy for implementing robust world data persistence in CardShark. Building on the lessons from the chat persistence implementation, this strategy ensures reliable storage of world states, locations, and associated world interactions.

## Persistence Goals

1. **Data Integrity**: Ensure world data is never corrupted, even during crashes or unexpected shutdowns
2. **Performance**: Minimize unnecessary writes while maintaining up-to-date state
3. **Reliability**: Provide consistent recovery mechanisms for all world-related data
4. **Scalability**: Support growing worlds with many locations and interactions without degradation

## World Data Components

The world system consists of several interconnected data components:

1. **World State**: Core data structure containing world metadata, locations, and player state
2. **World Chats**: Conversations associated with specific locations or world NPCs
3. **Location Data**: Individual location details, descriptions, and properties
4. **World Events**: Triggered events and their outcomes in the world
5. **World Metadata**: Information about available worlds and their properties

## Implementation Strategy

### Phase 1: Atomic File Operations

**Goal**: Prevent data corruption and ensure all write operations are reliable.

**Tasks**:
- [ ] Implement atomic world state saves using the temporary file pattern
- [ ] Standardize file write patterns across all world operations
- [ ] Add file locking during critical world state updates
- [ ] Create backup of world state before significant changes
- [ ] Add world state integrity verification after save operations

**Files to implement/modify**:
- `backend/world_state_manager.py`: Implement `save_world_state()` with atomic operations
- `backend/world_chat_endpoints.py`: Use atomic operations for chat persistence

### Phase 2: Enhanced Error Recovery

**Goal**: Add robust error handling and recovery mechanisms for world data.

**Tasks**:
- [ ] Create world state validation function
- [ ] Add auto-recovery for corrupted world metadata
- [ ] Implement backup/restore system for world state files
- [ ] Add detailed logging for all world file operations
- [ ] Create migration path for evolving world data formats with schema versioning

**Files to implement/modify**:
- `backend/world_state_manager.py`: Add validation and recovery methods
- `backend/world_endpoints.py`: Enhance error handling

### Phase 3: Optimized Save Strategy

**Goal**: Reduce unnecessary writes while ensuring world state integrity.

**Tasks**:
- [ ] Implement debounced world state saves
- [ ] Add configurable autosave interval for world changes
- [ ] Save on significant world events rather than every minor change
- [ ] Optimize batch operations for large world updates
- [ ] Add periodic background saves for unsaved changes

**Files to implement/modify**:
- `backend/world_state_manager.py`: Add debounce and batch save methods
- `frontend/src/contexts/WorldStateContext.tsx`: Implement optimized save strategies

### Phase 4: World Data Session Management

**Goal**: Improve world session tracking and transitions.

**Tasks**:
- [ ] Design robust active world tracking system
- [ ] Ensure consistent world ID generation and reference
- [ ] Create efficient indexing for world locations
- [ ] Implement reliable world session switching
- [ ] Add world metadata indexing for faster lookups

**Files to implement/modify**:
- `backend/world_state_manager.py`: Implement session management methods
- `frontend/src/api/worldApi.ts`: Enhance session handling

## Implementation Details

### File Structure and Organization

World data will be organized in a hierarchical structure:

```
/worlds/
  /{world_name}/
    world_state.json       # Primary world state data
    metadata.json          # World metadata and properties
    /images/               # World-specific images
      /backgrounds/        # Location background images
      /objects/            # Object images for the world
    /chats/               # Location-specific conversations
      {location_id}_chat.jsonl
    /events/              # Event records and outcomes
      {event_id}.json
```

### File Format Standards

#### World State

The world state will be stored in a structured JSON format:

```json
{
  "metadata": {
    "version": "1.0",
    "created_at": 1234567890,
    "last_modified": 1234567890,
    "name": "World Name"
  },
  "current_position": "0,0,0",
  "visited_positions": ["0,0,0", "1,0,0"],
  "locations": {
    "0,0,0": {
      "location_id": "start_room",
      "name": "Starting Room",
      "description": "The beginning of your adventure.",
      "coordinates": [0, 0, 0],
      "npcs": ["character_uuid1", "character_uuid2"],
      "events": []
    },
    "1,0,0": {
      // Another location
    }
  },
  "unconnected_locations": {
    "forest_clearing": {
      "location_id": "forest_clearing",
      "name": "Forest Clearing",
      "description": "A peaceful clearing in the forest.",
      "lore_source": "Character lore entry about forests"
    }
  },
  "player": {
    "health": 100,
    "stamina": 100,
    "level": 1,
    "experience": 0
  }
}
```

#### World Chats

World chats will follow the same JSONL format as character chats, with location context:

```
{"metadata": {"version": "1.0", "location_id": "forest_clearing", "world_name": "Fantasy World"}, "timestamp": 1234567890}
{"id": "msg_1", "role": "user", "content": "Look around", "timestamp": 1234567891}
{"id": "msg_2", "role": "assistant", "content": "You see tall trees surrounding you...", "timestamp": 1234567892}
```

### Atomic Write Operations

For atomic world state operations, we'll use this pattern:

1. Create a temporary file with a unique name
2. Write all content to the temporary file
3. Validate the integrity of the temporary file
4. Atomically replace the target file with the temporary file
5. Handle errors at each step with appropriate recovery

Example implementation:

```python
def save_world_state(world_name, state):
    # Create world directory if it doesn't exist
    world_dir = self._get_world_dir(world_name)
    world_dir.mkdir(parents=True, exist_ok=True)
    
    # Path to world state file
    state_file = world_dir / "world_state.json"
    
    # Create temporary file
    temp_file = world_dir / f"world_state.{uuid.uuid4()}.tmp"
    
    try:
        # Write state to temporary file
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(state.dict(), f, indent=2)
        
        # Validate content
        self._validate_world_state_file(temp_file)
        
        # Atomic replace (os.replace is atomic)
        os.replace(temp_file, state_file)
        
        return True
    except Exception as e:
        self.logger.log_error(f"Failed to save world state: {str(e)}")
        # Clean up temporary file if it exists
        if temp_file.exists():
            temp_file.unlink()
        return False
```

### World ID Management

We'll implement consistent world ID management:

1. World names will be used as unique identifiers
2. Names will be sanitized to create valid filenames
3. Internal references will use consistent IDs
4. Location IDs will be unique within each world

### Versioning and Migration

All world data will include version information to support future migrations:

1. Every world state file will have a version field
2. When loading, version will be checked and migration applied if needed
3. Breaking changes will increment the major version number
4. Migration functions will be provided for each version upgrade

## Integration with Character System

The world system will integrate with the existing character system:

1. Character cards can be the basis for world creation
2. NPCs in locations will reference character UUIDs
3. Character lore can suggest world locations
4. World conversations can reference character knowledge

## Integration with Chat System

World conversations will leverage the established chat persistence system:

1. Location-specific chats will follow the chat file format
2. Chat history will be tied to specific locations
3. NPC interactions will be recorded in the appropriate chat files
4. The same atomic file operations will be used for world chats

## Progress Tracking

- **Phase 1**: Atomic file operations - 0% complete
- **Phase 2**: Enhanced error recovery - 0% complete 
- **Phase 3**: Optimized save strategy - 0% complete
- **Phase 4**: World data session management - 0% complete

## Success Criteria

The implementation will be considered successful when:

1. No world data is lost during normal operation or crashes
2. All world states are correctly loaded when selected
3. World history is persistent across application restarts
4. Performance remains high even with large and complex worlds
5. Multiple worlds are correctly managed with proper isolation