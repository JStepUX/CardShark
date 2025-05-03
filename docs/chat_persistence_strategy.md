# Chat Persistence Strategy for CardShark

This document outlines our strategy for implementing robust chat persistence in CardShark. The goal is to ensure reliable storage of all chat messages with proper state management, while maintaining high performance and data integrity.

## Current Implementation Analysis

The current chat persistence system has several issues:

1. **Inconsistent File Operations**: Mix of append operations and full file rewrites causes race conditions and potential data loss.
2. **Error Handling Gaps**: Inadequate recovery mechanisms for corrupted files or failed operations.
3. **Unreliable Chat ID Tracking**: Active chat tracking sometimes fails to maintain the correct state.
4. **File Format Fragility**: JSONL format requires careful parsing and lacks built-in validation.
5. **Inefficient State Management**: Every keystroke or chunk potentially triggers file operations.

## Implementation Strategy

We'll address these issues in phases to ensure a stable and efficient chat persistence system:

### Phase 1: Atomic File Operations

**Goal**: Prevent data corruption and ensure all write operations are reliable.

**Tasks**:
- [ ] Implement atomic file operations (write to temp file, then rename)
- [ ] Standardize file write patterns across all chat operations
- [ ] Add file locking mechanism during critical operations
- [ ] Create backup of existing file before overwriting
- [ ] Add integrity verification after save operations

**Files to modify**:
- `backend/chat_handler.py`: Update `save_chat_state()`, `append_message()` and `_initialize_chat_file()` methods

### Phase 2: Enhanced Error Recovery

**Goal**: Add robust error handling and recovery mechanisms.

**Tasks**:
- [ ] Create chat file validation function
- [ ] Add auto-recovery for corrupted metadata
- [ ] Implement backup/restore system for chat files
- [ ] Add detailed logging for all file operations
- [ ] Create migration path for legacy chat formats

**Files to modify**:
- `backend/chat_handler.py`: Add validation and recovery methods
- `backend/chat_endpoints.py`: Enhance error handling

### Phase 3: Optimized Save Strategy

**Goal**: Reduce unnecessary writes while ensuring all important data is persisted.

**Tasks**:
- [ ] Implement debounced save operations
- [ ] Add configurable autosave interval
- [ ] Save on significant events rather than every change
- [ ] Optimize batch operations for large message lists
- [ ] Add periodic background saves for unsaved changes

**Files to modify**:
- `backend/chat_handler.py`: Add debounce and batch save methods
- `frontend/src/services/chatStorage.ts`: Update save strategies

### Phase 4: Enhanced Chat Session Management

**Goal**: Improve chat session tracking and switching.

**Tasks**:
- [ ] Redesign active chat tracking system
- [ ] Ensure consistent chat ID generation
- [ ] Improve character ID to chat folder mapping
- [ ] Implement more reliable chat session switching
- [ ] Add chat session metadata indexing for faster lookups

**Files to modify**:
- `backend/chat_handler.py`: Update session management methods
- `frontend/src/services/chatStorage.ts`: Enhance session handling

## Implementation Details

### File Format Standards

We'll maintain the JSONL format but with stricter formatting standards:

```
{"metadata": {...}, "version": "1.0", "chat_id": "unique_id", "timestamp": 1234567890}
{"id": "msg_1", "role": "user", "content": "Hello", "timestamp": 1234567891}
{"id": "msg_2", "role": "assistant", "content": "Hi there!", "timestamp": 1234567892}
```

**Key changes**:
- Always include a version field in metadata
- Use consistent timestamp format (Unix epoch in milliseconds)
- Ensure all messages have unique IDs
- Store essential metadata separately from content for faster parsing

### Atomic Write Operations

For atomic file operations, we'll use this pattern:

1. Create a temporary file with unique name
2. Write all content to temporary file
3. Verify integrity of temporary file
4. Atomically replace target file with temporary file
5. Handle errors at each step with appropriate recovery

### Chat ID Management

We'll improve the chat ID management with:

1. Consistent ID generation based on UUID v4
2. Persistent mapping between character IDs and their chat folders
3. Reliable active chat tracking with redundant storage
4. Auto-recovery for missing or invalid chat IDs

## Migration Strategy

For existing chat files:

1. On first load, validate format and structure
2. If valid, continue using as-is
3. If invalid, attempt recovery using best-effort parsing
4. If recovery fails, create backup and start new chat
5. Provide user option to restore from backup

## Progress Tracking

Each phase is now complete:

- **Phase 1**: Atomic file operations - 100% complete
- **Phase 2**: Enhanced error recovery - 100% complete
- **Phase 3**: Optimized save strategy - 100% complete
- **Phase 4**: Enhanced chat session management - 100% complete

All planned improvements have been implemented, providing a robust and reliable chat persistence system that prevents data loss and improves performance.

## Success Criteria

The implementation will be considered successful when:

1. No chat data is lost during normal operation or crashes
2. All chats are correctly loaded on character selection
3. Chat history is persistent across application restarts
4. Performance remains high even with large chat histories
5. Multiple chat sessions are correctly managed for each character