############################################################################
# CARDSHARK CONTEXT MANAGEMENT SYSTEM
# Feature Specification for LLM-Assisted Implementation
############################################################################
# 
# CONTEXT FOR IMPLEMENTING AGENT:
# CardShark is a character roleplay application with React/TypeScript frontend
# and Python/FastAPI backend. This spec adds intelligent context management
# that expires low-value character card fields as conversations progress,
# complementing the existing chat history compression system.
#
# EXISTING SYSTEMS TO INTEGRATE WITH:
# - Chat compression (summarizes old messages after threshold)
# - Token counting modal (displays payload breakdown)
# - Template system (formats character data into prompts)
# - Per-chat settings persistence
#
############################################################################

meta:
  feature_name: "Intelligent Context Management"
  version: "1.0.0"
  priority: high
  complexity: medium
  estimated_scope: "~400-600 lines across 8-10 files"
  
  success_criteria:
    - Users can select compression level from dropdown UI
    - Character card fields expire based on message count and compression level
    - Token modal shows per-field breakdown with expiration status
    - Settings persist per chat session
    - No regression in existing chat compression functionality
    - Token savings visible to user

############################################################################
# PART 1: TYPE DEFINITIONS
############################################################################

types:
  location: "frontend/src/types/ (find existing types file or create contextManagement.ts)"
  
  definitions:
    CompressionLevel:
      type: enum
      values:
        - none           # No compression, full payload
        - chat_only      # Existing behavior: summarize old messages only  
        - chat_dialogue  # Chat compression + expire example dialogue
        - aggressive     # Chat compression + expire all priming/situational fields
      notes: "String literal union type in TypeScript"

    FieldExpirationConfig:
      type: interface
      properties:
        permanent:
          type: boolean
          description: "If true, field never expires regardless of settings"
        expiresAtMessage:
          type: "number | null"
          description: "Message count at which field expires. Null = never"
        minimumCompressionLevel:
          type: CompressionLevel
          description: "Lowest compression level that will expire this field"

    FieldTokenInfo:
      type: interface
      properties:
        fieldKey:
          type: string
          description: "v2 spec field name (system_prompt, description, etc)"
        fieldLabel:
          type: string
          description: "Human-readable label for UI display"
        tokens:
          type: number
          description: "Estimated token count for this field"
        status:
          type: "'permanent' | 'active' | 'expired'"
          description: "Current inclusion state"
        expiredAtMessage:
          type: "number | undefined"
          description: "If expired, at what message count"

    MemoryContextResult:
      type: interface
      properties:
        memory:
          type: string
          description: "Assembled prompt string (existing return value)"
        fieldBreakdown:
          type: "FieldTokenInfo[]"
          description: "Per-field token accounting for modal display"
        totalTokens:
          type: number
          description: "Sum of included field tokens"
        savedTokens:
          type: number
          description: "Sum of expired field tokens (for UI feedback)"

############################################################################
# PART 2: CONFIGURATION CONSTANTS
############################################################################

configuration:
  location: "frontend/src/handlers/promptHandler.ts (top of file with other constants)"
  
  field_expiration_config:
    description: "Defines expiration behavior for each v2 spec field"
    constant_name: "FIELD_EXPIRATION_CONFIG"
    type: "Record<string, FieldExpirationConfig>"
    
    values:
      system_prompt:
        permanent: true
        expiresAtMessage: null
        minimumCompressionLevel: none
        rationale: "Core character instructions, must always be present"
        
      description:
        permanent: true
        expiresAtMessage: null
        minimumCompressionLevel: none
        rationale: "Character identity, required for coherent responses"
        
      personality:
        permanent: true
        expiresAtMessage: null
        minimumCompressionLevel: none
        rationale: "Behavioral traits, needed throughout conversation"
        
      scenario:
        permanent: false
        expiresAtMessage: 3
        minimumCompressionLevel: aggressive
        rationale: "Setup context; once RP is underway, scenario is established"
        
      mes_example:
        permanent: false
        expiresAtMessage: 5
        minimumCompressionLevel: chat_dialogue
        rationale: "Style priming; actual conversation demonstrates style after ~5 exchanges"
        
      first_mes:
        permanent: false
        expiresAtMessage: 3
        minimumCompressionLevel: aggressive
        rationale: "Opening context; superseded by actual conversation flow"

  compression_level_hierarchy:
    description: "Order matters - higher index = more aggressive"
    constant_name: "COMPRESSION_LEVEL_HIERARCHY"
    type: "CompressionLevel[]"
    value: ["none", "chat_only", "chat_dialogue", "aggressive"]

############################################################################
# PART 3: CORE LOGIC CHANGES
############################################################################

core_logic:
  file: "frontend/src/handlers/promptHandler.ts"
  
  new_helper_methods:
    - name: "compressionLevelIncludes"
      visibility: "private static"
      purpose: "Check if current compression level is >= required level"
      signature: |
        private static compressionLevelIncludes(
          current: CompressionLevel, 
          required: CompressionLevel
        ): boolean
      implementation: |
        const hierarchy = COMPRESSION_LEVEL_HIERARCHY;
        return hierarchy.indexOf(current) >= hierarchy.indexOf(required);
      
    - name: "estimateTokens"
      visibility: "private static"
      purpose: "Rough token count estimation for a string"
      signature: |
        private static estimateTokens(text: string): number
      implementation: |
        if (!text) return 0;
        // ~4 characters per token is a reasonable English approximation
        // For accuracy, could integrate tiktoken but adds dependency
        return Math.ceil(text.length / 4);
      notes: "Consider making ratio configurable or using actual tokenizer"

    - name: "shouldExpireField"
      visibility: "private static"  
      purpose: "Determine if a specific field should be excluded from context"
      signature: |
        private static shouldExpireField(
          fieldKey: string,
          compressionLevel: CompressionLevel,
          messageCount: number
        ): boolean
      implementation: |
        const config = FIELD_EXPIRATION_CONFIG[fieldKey];
        if (!config || config.permanent) return false;
        if (compressionLevel === 'none') return false;
        
        const meetsCompressionLevel = this.compressionLevelIncludes(
          compressionLevel, 
          config.minimumCompressionLevel
        );
        const meetsMessageThreshold = messageCount >= (config.expiresAtMessage || Infinity);
        
        return meetsCompressionLevel && meetsMessageThreshold;

  modified_methods:
    - name: "createMemoryContext"
      change_type: "signature_and_implementation"
      
      current_signature: |
        public static createMemoryContext(
          character: CharacterCard, 
          template: Template | null, 
          userName?: string
        ): string
        
      new_signature: |
        public static createMemoryContext(
          character: CharacterCard, 
          template: Template | null, 
          userName?: string,
          compressionLevel: CompressionLevel = 'none',
          messageCount: number = 0
        ): MemoryContextResult
        
      implementation_outline:
        step_1:
          description: "Define field mappings"
          code: |
            const fieldMappings: Array<{
              key: string;
              label: string;
              templateVar: string;
              getValue: () => string;
            }> = [
              { 
                key: 'system_prompt', 
                label: 'System Prompt',
                templateVar: 'system',
                getValue: () => character.data.system_prompt || ''
              },
              { 
                key: 'description', 
                label: 'Description',
                templateVar: 'description',
                getValue: () => character.data.description || ''
              },
              { 
                key: 'personality', 
                label: 'Personality',
                templateVar: 'personality',
                getValue: () => character.data.personality || ''
              },
              { 
                key: 'scenario', 
                label: 'Scenario',
                templateVar: 'scenario',
                getValue: () => character.data.scenario || ''
              },
              { 
                key: 'mes_example', 
                label: 'Example Dialogue',
                templateVar: 'examples',
                getValue: () => character.data.mes_example || ''
              },
            ];
            
        step_2:
          description: "Process each field for inclusion/exclusion"
          code: |
            const fieldBreakdown: FieldTokenInfo[] = [];
            const includedVariables: Record<string, string> = { user: currentUser };
            let totalTokens = 0;
            let savedTokens = 0;
            
            for (const field of fieldMappings) {
              const value = field.getValue();
              const tokens = this.estimateTokens(value);
              const config = FIELD_EXPIRATION_CONFIG[field.key];
              
              const isExpired = this.shouldExpireField(
                field.key, 
                compressionLevel, 
                messageCount
              );
              
              if (isExpired) {
                fieldBreakdown.push({
                  fieldKey: field.key,
                  fieldLabel: field.label,
                  tokens,
                  status: 'expired',
                  expiredAtMessage: config?.expiresAtMessage ?? undefined
                });
                savedTokens += tokens;
                includedVariables[field.templateVar] = '';
              } else {
                fieldBreakdown.push({
                  fieldKey: field.key,
                  fieldLabel: field.label,
                  tokens,
                  status: config?.permanent ? 'permanent' : 'active'
                });
                totalTokens += tokens;
                includedVariables[field.templateVar] = value;
              }
            }
            
        step_3:
          description: "Build memory string using existing template logic"
          notes: |
            Preserve existing template vs default-format branching.
            Use includedVariables (which now has empty strings for expired fields)
            instead of directly accessing character.data.
            
        step_4:
          description: "Return enriched result object"
          code: |
            return {
              memory,  // The assembled string (existing behavior)
              fieldBreakdown,
              totalTokens,
              savedTokens
            };

    - name: "generateChatResponse"
      change_type: "parameter_and_call_site"
      
      changes:
        - description: "Add compressionLevel parameter"
          detail: |
            Change `compressionEnabled?: boolean` to include level:
            compressionLevel?: CompressionLevel
            
            For backwards compatibility, can keep compressionEnabled and derive:
            - compressionEnabled=false → compressionLevel='none'
            - compressionEnabled=true → compressionLevel='chat_only' (or read from new param)
            
        - description: "Update createMemoryContext call"
          before: |
            if (characterCard?.data) {
              memory = this.createMemoryContext(characterCard, template, 'User');
            }
          after: |
            let memoryResult: MemoryContextResult | null = null;
            if (characterCard?.data) {
              memoryResult = this.createMemoryContext(
                characterCard, 
                template, 
                'User',
                compressionLevel ?? 'none',
                contextMessages.length
              );
              memory = memoryResult.memory;
            }
            
        - description: "Pass field breakdown to payload callback"
          detail: |
            Enhance onPayloadReady callback data to include:
            - memoryResult.fieldBreakdown
            - memoryResult.savedTokens
            This enables the modal to display per-field token info.

############################################################################
# PART 4: STATE MANAGEMENT
############################################################################

state_management:
  file: "frontend/src/contexts/ChatContext.tsx"
  
  changes:
    - description: "Add compressionLevel to context state"
      current_properties:
        - "compressionEnabled: boolean"
        - "isCompressing: boolean"
      new_properties:
        - "compressionLevel: CompressionLevel"
        - "setCompressionLevel: (level: CompressionLevel) => void"
        - "isCompressing: boolean"
      notes: |
        Can deprecate compressionEnabled or derive it:
        compressionEnabled = compressionLevel !== 'none'
        
    - description: "Persist compressionLevel per chat session"
      implementation: |
        Use existing chatService pattern to save/load compressionLevel
        alongside other per-chat settings.
        
        On chat load: setCompressionLevel(chat.settings?.compressionLevel ?? 'none')
        On level change: chatService.updateChatSettings(chatId, { compressionLevel })

############################################################################
# PART 5: UI COMPONENTS
############################################################################

ui_components:
  compression_dropdown:
    file: "frontend/src/components/SidePanel/CompressionToggle.tsx"
    change_type: "replace_or_heavily_modify"
    
    current_behavior: "Toggle switch for compressionEnabled boolean"
    new_behavior: "Dropdown selector for CompressionLevel enum"
    
    design_spec:
      component_name: "ContextManagementDropdown"
      
      visual_reference: |
        ┌─────────────────────────────────────────┐
        │ Context Mgt.  [  Chat + Dialogue  ▼]   │
        └─────────────────────────────────────────┘
        
        Dropdown options:
        ┌────────────────────┐
        │ No Compression     │  ← Green text or neutral
        │ Chat Only          │
        │ Chat + Dialogue    │
        │ Aggressive         │  ← Could show warning color
        └────────────────────┘
        
      props:
        - name: compressionLevel
          type: CompressionLevel
          source: ChatContext
        - name: onLevelChange
          type: "(level: CompressionLevel) => void"
          source: ChatContext.setCompressionLevel
          
      tooltips:
        none: "Full context, no compression. Best quality, highest token usage."
        chat_only: "Summarizes old messages. Character card unchanged."
        chat_dialogue: "Summarizes chat + expires example dialogue after 5 messages."
        aggressive: "Maximum compression. Expires scenario and situational fields."
        
      styling_notes:
        - Match existing SidePanel component patterns
        - Current selection shown in dropdown button
        - Consider color coding based on aggressiveness
        - "No Compression" could be cyan/teal (matching existing UI in mockup)

  token_modal_enhancement:
    file: "frontend/src/components/SidePanel/TokenModal.tsx (or wherever current modal lives)"
    
    current_display:
      sections:
        - "Memory (System Prompt): X tokens"
        - "Formatted Prompt: X tokens"  
        - "Raw Chat History: X tokens"
        
    new_display:
      sections:
        - label: "Character Card Fields"
          expandable: true
          children:
            - "System Prompt: 737 tokens [permanent]"
            - "Description: 400 tokens [permanent]"
            - "Personality: 280 tokens [permanent]"
            - "Scenario: 190 tokens [expired @ msg 3]"  # greyed/struck styling
            - "Example Dialogue: 520 tokens [expired @ msg 5]"  # greyed/struck
          subtotal: "Active: 1,417 tokens | Saved: 710 tokens"
          
        - label: "Chat History"
          value: "2,200 tokens"
          detail: "(Summarized from 4,800)"  # Only shown if compression active
          
        - label: "Total"
          value: "3,617 tokens"
          
    implementation_notes:
      - Receive fieldBreakdown from payload callback or context
      - Map status to visual treatment (permanent=normal, active=normal, expired=grey+strikethrough)
      - Show expiration message threshold for expired fields
      - Calculate and display savings prominently

  optional_enhancements:
    savings_toast:
      description: "Brief notification when compression saves significant tokens"
      trigger: "When savedTokens > 500 and compression level changes"
      message: "Context optimized: saved ~{n} tokens"
      duration: "3 seconds, dismissible"
      priority: low
      
    pressure_indicator:
      description: "Visual hint when approaching context limit"
      trigger: "When usage > 80% of context limit"
      behavior: "Subtle highlight on 'Aggressive' option in dropdown"
      priority: low

############################################################################
# PART 6: DATA FLOW
############################################################################

data_flow:
  description: "How compression level setting flows through the system"
  
  sequence:
    1_user_action:
      location: "ContextManagementDropdown"
      action: "User selects 'Chat + Dialogue' from dropdown"
      
    2_state_update:
      location: "ChatContext"
      action: "setCompressionLevel('chat_dialogue')"
      side_effect: "Persist to backend via chatService"
      
    3_generation_trigger:
      location: "User sends message or regenerates"
      action: "generationOrchestrator calls generateChatResponse"
      
    4_parameter_passing:
      location: "generationOrchestrator.ts"
      action: "Pass compressionLevel from context to PromptHandler"
      code_hint: |
        PromptHandler.generateChatResponse(
          chatSessionUuid,
          messages,
          apiConfig,
          signal,
          characterCard,
          sessionNotes,
          compressionLevel,  // Changed from compressionEnabled
          onCompressionStart,
          onCompressionEnd,
          onPayloadReady
        )
        
    5_memory_assembly:
      location: "PromptHandler.createMemoryContext"
      action: |
        - Evaluate each field against expiration rules
        - Build fieldBreakdown array
        - Assemble memory string with only included fields
        - Return MemoryContextResult
        
    6_payload_callback:
      location: "PromptHandler.generateChatResponse"
      action: |
        - Include fieldBreakdown in onPayloadReady callback
        - This makes breakdown available to modal component
        
    7_modal_display:
      location: "TokenModal"
      action: |
        - Receive fieldBreakdown from callback/context
        - Render per-field rows with status badges
        - Show savings calculation

############################################################################
# PART 7: TESTING CONSIDERATIONS
############################################################################

testing:
  unit_tests:
    location: "Create if not exists: frontend/src/handlers/__tests__/promptHandler.test.ts"
    
    cases:
      - name: "compressionLevelIncludes returns correct hierarchy comparisons"
        scenarios:
          - "aggressive includes chat_dialogue: true"
          - "chat_only includes aggressive: false"
          - "none includes anything: false"
          
      - name: "shouldExpireField respects permanent flag"
        scenario: "system_prompt never expires regardless of level/message count"
        
      - name: "shouldExpireField respects message threshold"
        scenarios:
          - "mes_example at message 4 with chat_dialogue: not expired"
          - "mes_example at message 5 with chat_dialogue: expired"
          - "mes_example at message 10 with chat_only: not expired (wrong level)"
          
      - name: "createMemoryContext returns correct fieldBreakdown"
        scenario: "Verify all fields present with correct token estimates and statuses"
        
      - name: "createMemoryContext excludes expired field content"
        scenario: "With aggressive at message 10, scenario content not in memory string"

  integration_tests:
    - description: "Compression level persists across page reload"
    - description: "Modal displays correct breakdown after generation"
    - description: "Changing compression level mid-conversation applies on next generation"

  manual_testing_checklist:
    - "Select each compression level, verify dropdown shows selection"
    - "Generate responses at various message counts, verify field expiration"
    - "Open token modal, verify breakdown matches expected expiration state"
    - "Reload page, verify compression level persisted"
    - "Start new chat, verify compression level resets to default (or inherits global pref)"

############################################################################
# PART 8: MIGRATION / BACKWARDS COMPATIBILITY
############################################################################

migration:
  existing_compression_toggle:
    strategy: "Graceful deprecation"
    steps:
      - "Keep compressionEnabled in state temporarily"
      - "Derive from compressionLevel: enabled = level !== 'none'"
      - "Existing saved chats with compressionEnabled=true map to 'chat_only'"
      - "Remove compressionEnabled after migration period (optional)"
      
  existing_chats_without_level:
    handling: "Default to 'none' if no compressionLevel saved"
    
  api_compatibility:
    notes: |
      If backend stores chat settings, may need migration to add
      compressionLevel field. Default to null/none for existing records.

############################################################################
# PART 9: IMPLEMENTATION ORDER
############################################################################

implementation_order:
  description: "Suggested sequence to minimize broken states during development"
  
  phases:
    phase_1_foundation:
      name: "Types and Configuration"
      files:
        - "types file: Add new type definitions"
        - "promptHandler.ts: Add constants and helper methods"
      validation: "TypeScript compiles without errors"
      
    phase_2_core_logic:
      name: "Refactor createMemoryContext"
      files:
        - "promptHandler.ts: Update createMemoryContext signature and implementation"
      validation: |
        - Existing behavior unchanged when compressionLevel='none'
        - Returns MemoryContextResult with correct structure
      notes: "Can temporarily ignore new params at call sites"
      
    phase_3_integration:
      name: "Wire up parameter passing"
      files:
        - "ChatContext.tsx: Add compressionLevel state"
        - "generationOrchestrator.ts: Pass compressionLevel through"
        - "generateChatResponse: Accept and use compressionLevel"
      validation: "Generation still works, compression level affects output"
      
    phase_4_ui:
      name: "User interface"
      files:
        - "CompressionToggle.tsx: Replace with dropdown"
        - "TokenModal: Enhance with field breakdown"
      validation: "User can select levels, modal shows breakdown"
      
    phase_5_persistence:
      name: "Settings persistence"
      files:
        - "ChatContext.tsx: Save/load compressionLevel"
        - "Backend if needed: Add field to chat settings schema"
      validation: "Selection survives page reload"
      
    phase_6_polish:
      name: "Optional enhancements"
      items:
        - "Savings toast notification"
        - "Context pressure indicator"
        - "Cleanup deprecated compressionEnabled"
      priority: "After core feature stable"

############################################################################
# PART 10: OPEN QUESTIONS / DECISIONS
############################################################################

open_questions:
  - question: "Should compression level be per-chat or global preference?"
    recommendation: "Global preference, saved globally in settings.json"
    
  - question: "Should expired fields be re-injectable if user lowers compression level?"
    current_spec: "Yes - expiration is evaluated fresh each generation"
    
  - question: "Exact token estimation method?"
    current_spec: "length/4 approximation"
    alternative: "Integrate tiktoken for accuracy (adds dependency)"
    recommendation: "Start with approximation, upgrade if users report issues"
    
  - question: "Should first_mes be tracked as a field?"
    current_spec: "Included in FIELD_EXPIRATION_CONFIG"
    consideration: "first_mes handling may be separate from memory assembly"
    action: "Verify where first_mes is used in current codebase"

############################################################################
# END OF SPECIFICATION
############################################################################