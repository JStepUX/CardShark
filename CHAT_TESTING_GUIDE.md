# Testing Guide: Enhanced Chat Persistence

## Quick Test Scenarios

### Test 1: Basic Auto-Save Behavior
1. Start the application
2. Select a character and go to chat
3. Send a few messages
4. Navigate to another section (e.g., Gallery)
5. Return to Chat with the same character
6. **Expected**: All messages should be preserved

### Test 2: New Chat Functionality
1. Have an active chat with messages
2. Click "New Chat" button
3. **Expected**: 
   - Old chat is automatically saved
   - New chat starts with character greeting
   - Previous chat can be accessed later

### Test 3: Browser Restart Persistence
1. Have an active chat with messages
2. Close the browser completely
3. Reopen browser and navigate to the character
4. **Expected**: Latest chat session is loaded automatically

### Test 4: Navigation Auto-Save
1. Start typing in chat (don't send yet)
2. Send a message
3. Immediately navigate to Settings
4. Return to Chat
5. **Expected**: Message should be saved and visible

### Test 5: Page Unload Protection
1. Have unsaved changes in chat
2. Try to close the browser tab
3. **Expected**: Browser should warn about unsaved changes

## Debugging

### Console Logs to Watch For
- `[EnhancedChatSession] Auto-saving X messages for session Y`
- `[EnhancedChatSession] Navigation detected from /chat to /other`
- `[EnhancedChatSession] Force saving for navigation`
- `[setGeneratingStart] State updated with generatingId: X`

### Common Issues
1. **Messages not saving**: Check console for auto-save errors
2. **Navigation not triggering save**: Verify navigation detection logs
3. **Session not loading**: Check character UUID and session creation
4. **Dirty state not updating**: Verify markDirty calls in message operations

### Network Tab Monitoring
Watch for these API calls:
- `/api/reliable-save-chat` - Chat saving
- `/api/reliable-load-chat` - Chat loading  
- `/api/reliable-create-chat` - New session creation
- `/api/reliable-append-message` - Message appending

## Success Criteria

✅ **Automatic Saving**: Messages are saved without manual intervention
✅ **Navigation Safety**: No data loss when switching between app sections  
✅ **Session Continuity**: Chats resume where they left off
✅ **New Chat Workflow**: Previous chats are preserved when starting new ones
✅ **Performance**: No excessive API calls or UI blocking
✅ **Error Handling**: Graceful handling of network/storage errors

## Expected User Experience

The chat system should now behave like modern messaging apps:
- **Seamless**: No need to manually save chats
- **Reliable**: Data persists across sessions and navigation
- **Predictable**: Latest chat always loads for each character
- **Safe**: Protection against accidental data loss
