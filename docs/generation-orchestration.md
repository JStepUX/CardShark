# Generation Orchestration Refactoring

## Overview

This document describes the unified generation orchestration pattern implemented to consolidate all LLM generation logic (generate, regenerate, continue, greeting) into a consistent, maintainable architecture.

## Problem Statement

Previously, each generation type (generate, regenerate, continue, greeting) had its own implementation with:
- **Duplicated context building logic** - Each function manually built context messages
- **Inconsistent prompt construction** - Different approaches to adding instructions
- **Fragmented streaming logic** - Similar but slightly different buffering implementations
- **Variation management scattered** - No unified approach to handling message variations

The "Continue Response" bug was a symptom of this fragmentation - the continuation instruction was being added as a system message that got lost or misplaced during template formatting.

## Solution Architecture

### Core Principle
**Separate INTENT from MECHANICS**

- **Intent**: What type of generation (generate, regenerate, continue, greeting)
- **Mechanics**: How to build context, stream responses, update state

All generation types share the same mechanics but differ in intent.

### New Module: `generationOrchestrator.ts`

Located at: `frontend/src/utils/generationOrchestrator.ts`

#### Key Functions

1. **`buildGenerationContext(config, options)`**
   - Builds context messages based on generation type
   - Uses the shared `buildContextMessages` utility
   - Returns context + any additional instructions
   - Handles continuation instructions via session notes (not system messages)

2. **`executeGeneration(config, context)`**
   - Executes the generation request via `PromptHandler`
   - Properly positions continuation instructions in session notes
   - Ensures consistent payload structure

3. **`streamWithBuffering(response, config)`**
   - Unified streaming with configurable buffering
   - Optional content filtering
   - Consistent chunk handling

4. **`updateVariations(update)`**
   - Helper for managing message variations
   - Supports append (new variation) or replace (update current)

### Generation Types

#### 1. Generate (New Response)
```typescript
buildGenerationContext({
  type: 'generate',
  ...
}, {
  existingMessages: state.messages,
  newUserMessage: userMessage,
  excludeMessageId: assistantPlaceholder.id
})
```
- Includes all existing messages + new user message
- Excludes the assistant placeholder being generated

#### 2. Regenerate (New Variation)
```typescript
buildGenerationContext({
  type: 'regenerate',
  ...
}, {
  existingMessages: state.messages,
  targetMessage: messageToRegenerate,
  excludeMessageId: messageToRegenerate.id
})
```
- Includes messages up to (but not including) target
- Creates new variation of assistant response

#### 3. Continue (Extend Response)
```typescript
buildGenerationContext({
  type: 'continue',
  ...
}, {
  existingMessages: state.messages,
  targetMessage: messageToContinue,
  includeTargetInContext: true
})
```
- Includes messages up to and including target
- **Adds continuation instruction via session notes** (not system message)
- Appends to existing variation (doesn't create new one)

#### 4. Greeting (First Message)
```typescript
buildGenerationContext({
  type: 'greeting',
  ...
}, {
  existingMessages: [],
  targetMessage: greetingMessage
})
```
- No context messages (greeting from character data alone)
- Can regenerate greeting as new variation

## Key Improvements

### 1. Continuation Instructions Properly Positioned

**Before:**
```typescript
// Added as system message - gets lost in template formatting
const continuationPrompt = {
  role: 'system',
  content: `Continue from: "...${lastPart}"`
};
ctxMsgs.push(continuationPrompt);
```

**After:**
```typescript
// Added via additionalInstructions -> session notes
// PromptHandler positions this correctly BEFORE conversation history
additionalInstructions = `[CONTINUATION INSTRUCTION]
The assistant's previous response was cut off...
[END CONTINUATION INSTRUCTION]`;
```

### 2. Consistent Context Building

All generation types now use `buildContextMessages` utility:
- Filters thinking messages
- Handles variations correctly
- Applies context window limits
- Sanitizes content

### 3. Unified Streaming Pattern

All functions can use the same streaming logic:
```typescript
for await (const chunk of PromptHandler.streamResponse(response)) {
  if (abortCtrl.signal.aborted) { /* cleanup */ break; }
  updateContent(chunk);
}
```

## Migration Status

### ✅ Completed
- [x] Created `generationOrchestrator.ts`
- [x] Refactored `continueResponse` to use orchestrator

### 🔄 In Progress
- [ ] Refactor `regenerateMessage` to use orchestrator
- [ ] Refactor `generateResponse` to use orchestrator
- [ ] Refactor `regenerateGreeting` to use orchestrator (or migrate to unified pattern)

### 📋 Future Enhancements
- [ ] Extract streaming logic to `streamWithBuffering` helper
- [ ] Extract variation management to `updateVariations` helper
- [ ] Create unified error handling pattern
- [ ] Add retry logic to orchestrator

## Testing Checklist

When testing the refactored generation functions:

1. **Continue Response**
   - [ ] Click "Continue Response" on incomplete assistant message
   - [ ] Verify it continues from where it left off (not repeating)
   - [ ] Check Context Window modal shows continuation instruction in payload
   - [ ] Test with different models (Mistral, GPT, Claude)

2. **Regenerate Message**
   - [ ] Click "Try Again" on assistant message
   - [ ] Verify new variation is created
   - [ ] Check variation cycling works

3. **Generate Response**
   - [ ] Send new user message
   - [ ] Verify response generates correctly
   - [ ] Check context includes previous messages

4. **Regenerate Greeting**
   - [ ] Click regenerate on first assistant message
   - [ ] Verify new greeting variation is created

## Code Locations

- **Orchestrator**: `frontend/src/utils/generationOrchestrator.ts`
- **Context Builder**: `frontend/src/utils/contextBuilder.ts`
- **Prompt Handler**: `frontend/src/handlers/promptHandler.ts`
- **Chat Context**: `frontend/src/contexts/ChatContext.tsx`

## Benefits

1. **Maintainability**: Single source of truth for generation logic
2. **Consistency**: All generation types behave predictably
3. **Debuggability**: Easier to trace issues through unified flow
4. **Extensibility**: New generation types can reuse existing mechanics
5. **Testability**: Shared logic can be unit tested once

## Next Steps

1. Complete migration of remaining generation functions
2. Add comprehensive unit tests for orchestrator
3. Document generation flow in architecture diagrams
4. Consider extracting streaming/buffering to separate utility
