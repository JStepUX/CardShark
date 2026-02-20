/**
 * @file promptHandler.ts
 * @description Handles prompt building, context management, and LLM API communication.
 *
 * @deprecated This file is being replaced by the Context Management V2 system.
 * Migration path:
 * - createMemoryContext -> Use ContextAssembler.assembleContextSnapshot() + ContextSerializer.serializeContext()
 * - generateChatResponse -> Use chatService.generateResponse() directly
 * - streamResponse -> Still usable, no replacement needed (utility function)
 *
 * New services:
 * - ContextAssembler: services/context/ContextAssembler.ts
 * - ContextSerializer: services/context/ContextSerializer.ts
 * - useContextSnapshot hook: hooks/useContextSnapshot.ts
 *
 * This file will be removed after migration is complete and verified.
 */
// handlers/promptHandler.ts
import { CharacterCard } from '../types/schema';
import { templateService } from '../services/templateService';
import { ChatStorage } from '../services/chatStorage';
import { Template } from '../types/templateTypes';
import {
  CompressionLevel,
  FieldExpirationConfig,
  FieldTokenInfo,
  MemoryContextResult,
  CompressedContextCache
} from '../services/chat/chatTypes';

// Debug flag - set to false to disable console.log statements
const DEBUG = false;

// Deprecation warning helper
const warnDeprecation = (methodName: string, replacement: string) => {
  if (typeof console !== 'undefined') {
    console.warn(
      `[DEPRECATED] PromptHandler.${methodName}() is deprecated. ` +
      `Use ${replacement} instead. This method will be removed in a future version.`
    );
  }
};

// Compression constants
const COMPRESSION_THRESHOLD = 20;  // don't compress below this
const RECENT_WINDOW = 10;          // always keep this many verbatim
const COMPRESSION_REFRESH_THRESHOLD = 20; // re-compress after this many new messages

/**
 * Compression level hierarchy - order matters (higher index = more aggressive)
 */
const COMPRESSION_LEVEL_HIERARCHY: CompressionLevel[] = [
  'none',
  'chat_only',
  'chat_dialogue',
  'aggressive'
];

/**
 * Field expiration configuration for each V2 spec field
 * Defines when each character card field should be excluded from context
 */
const FIELD_EXPIRATION_CONFIG: Record<string, FieldExpirationConfig> = {
  system_prompt: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none'
  },
  description: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none'
  },
  personality: {
    permanent: true,
    expiresAtMessage: null,
    minimumCompressionLevel: 'none'
  },
  scenario: {
    permanent: false,
    expiresAtMessage: 3,
    minimumCompressionLevel: 'aggressive'
  },
  mes_example: {
    permanent: false,
    expiresAtMessage: 5,
    minimumCompressionLevel: 'chat_dialogue'
  },
  first_mes: {
    permanent: false,
    expiresAtMessage: 3,
    minimumCompressionLevel: 'aggressive'
  }
};

export class PromptHandler {
  // Removed unused DEFAULT_PARAMS

  // Simple variable replacement function
  public static replaceVariables(template: string, variables: Record<string, string>): string { // Changed to public
    if (!template) return '';

    let result = template;

    // Replace each variable in the template
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    });

    return result;
  }

  /**
   * Check if current compression level is >= required level in hierarchy
   */
  private static compressionLevelIncludes(
    current: CompressionLevel,
    required: CompressionLevel
  ): boolean {
    const hierarchy = COMPRESSION_LEVEL_HIERARCHY;
    return hierarchy.indexOf(current) >= hierarchy.indexOf(required);
  }

  /**
   * Rough token count estimation for a string
   * Uses ~4 characters per token approximation for English text
   */
  private static estimateTokens(text: string): number {
    if (!text) return 0;
    // ~4 characters per token is a reasonable English approximation
    // For accuracy, could integrate tiktoken but adds dependency
    return Math.ceil(text.length / 4);
  }

  /**
   * Determine if a specific field should be excluded from context
   */
  private static shouldExpireField(
    fieldKey: string,
    compressionLevel: CompressionLevel,
    messageCount: number
  ): boolean {
    const config = FIELD_EXPIRATION_CONFIG[fieldKey];
    if (!config || config.permanent) return false;
    if (compressionLevel === 'none') return false;

    const meetsCompressionLevel = this.compressionLevelIncludes(
      compressionLevel,
      config.minimumCompressionLevel
    );
    const meetsMessageThreshold = messageCount >= (config.expiresAtMessage || Infinity);

    return meetsCompressionLevel && meetsMessageThreshold;
  }

  /**
   * Utility function to strip HTML tags from content
   * This ensures clean text is sent to the LLM without HTML markup
   */
  public static stripHtmlTags(content: string): string { // Changed to public
    if (!content) return '';

    // Create a DOM element to safely parse and extract text
    const temp = document.createElement('div');
    temp.innerHTML = content;

    // Get text content (strips HTML tags)
    const textContent = temp.textContent || temp.innerText || '';

    // Return non-empty text or original as fallback
    return textContent.trim() || content;
  }

  /**
   * Get a template by ID from the template service
   * @param templateId The ID of the template to retrieve
   * @returns The template or null if not found
   */
  public static getTemplate(templateId?: string): Template | null { // Changed to public
    // If templateId is provided, try to get that template
    if (templateId) {
      if (DEBUG) console.log(`Looking up template with ID: ${templateId}`);
      const template = templateService.getTemplateById(templateId);
      if (template) {
        if (DEBUG) console.log(`Found template: ${template.name}`);
        return template;
      } else {
        console.warn(`Template not found for ID: ${templateId}`);
      }
    } else {
      console.warn('No templateId provided');
    }

    // Fallback to mistral template or first available
    if (DEBUG) console.log('Falling back to default template');
    const defaultTemplate = templateService.getTemplateById('mistral') ||
      templateService.getAllTemplates()[0] ||
      null;

    if (defaultTemplate) {
      if (DEBUG) console.log(`Using default template: ${defaultTemplate.name}`);
    } else {
      console.error('No templates available');
    }

    return defaultTemplate;
  }

  /**
   * Create memory context from character data using template with intelligent field expiration
   * @param character The character card data
   * @param template The prompt template to use
   * @param userName The user's name for template variables
   * @param compressionLevel The current compression level (determines field expiration)
   * @param messageCount Current message count (determines if expiration threshold reached)
   * @returns Enhanced result with memory string and field breakdown
   *
   * @deprecated Use ContextAssembler.assembleContextSnapshot() + ContextSerializer.createMemoryContext() instead.
   * Migration:
   * ```typescript
   * import { useContextSnapshot } from '../hooks/useContextSnapshot';
   * const { getSerializedContext } = useContextSnapshot({ characterCard, ... });
   * const serialized = getSerializedContext();
   * // serialized.memoryContext contains the equivalent result
   * ```
   */
  public static createMemoryContext(
    character: CharacterCard,
    template: Template | null,
    userName?: string,
    compressionLevel: CompressionLevel = 'none',
    messageCount: number = 0
  ): MemoryContextResult {
    warnDeprecation('createMemoryContext', 'ContextSerializer.createMemoryContext() or useContextSnapshot hook');
    if (DEBUG) console.log('Creating memory context with template:', template?.name || 'No template', 'User:', userName, 'Compression:', compressionLevel, 'Messages:', messageCount);
    const currentUser = userName || 'User'; // Fallback for user name
    const characterName = character.data?.name || 'Character';

    // Define field mappings for all V2 spec fields
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
      }
    ];

    // Process each field for inclusion/exclusion based on compression settings
    const fieldBreakdown: FieldTokenInfo[] = [];
    const includedVariables: Record<string, string> = { user: currentUser, char: characterName };
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
        includedVariables[field.templateVar] = ''; // Empty string for expired fields
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

    // Build memory string using template or default format
    let memory: string;

    if (!template || !template.memoryFormat) {
      // Default memory format - manually build with included variables only
      const scenario = includedVariables.scenario || '';
      const parts: string[] = [];
      if (includedVariables.system) parts.push(includedVariables.system);
      if (includedVariables.description) parts.push(`Persona: ${includedVariables.description}`);
      if (includedVariables.personality) parts.push(`Personality: ${includedVariables.personality}`);
      if (scenario.trim()) parts.push(`[Scenario: ${scenario}]`);
      if (includedVariables.examples) parts.push(includedVariables.examples);
      parts.push('***');

      memory = parts.join('\n');
      if (DEBUG) console.log('Using default memory format with field expiration applied');
    } else {
      try {
        // Use template format with included variables (expired fields have empty strings)
        memory = this.replaceVariables(template.memoryFormat, includedVariables);
        if (DEBUG) console.log('Formatted memory using template with field expiration applied');
      } catch (error) {
        console.error('Error formatting memory context:', error);
        // Fallback to default format
        const fallbackScenario = includedVariables.scenario || '';
        const fallbackParts: string[] = [];
        if (includedVariables.system) fallbackParts.push(includedVariables.system);
        if (includedVariables.description) fallbackParts.push(`Persona: ${includedVariables.description}`);
        if (includedVariables.personality) fallbackParts.push(`Personality: ${includedVariables.personality}`);
        if (fallbackScenario.trim()) fallbackParts.push(`[Scenario: ${fallbackScenario}]`);
        if (includedVariables.examples) fallbackParts.push(includedVariables.examples);
        fallbackParts.push('***');
        memory = fallbackParts.join('\n');
      }
    }

    // Final pass: resolve any {{user}}/{{char}} tokens inside character card field values
    // (e.g., description contains "{{user}} is a friend" → "Doug is a friend")
    memory = memory
      .replace(/\{\{user\}\}/g, currentUser)
      .replace(/\{\{char\}\}/g, characterName);

    const result: MemoryContextResult = {
      memory: memory.trim(),
      fieldBreakdown,
      totalTokens,
      savedTokens
    };

    if (DEBUG && savedTokens > 0) {
      console.log(`Field expiration saved ${savedTokens} tokens (${fieldBreakdown.filter(f => f.status === 'expired').length} fields expired)`);
    }

    return result;
  }

  // Format prompt using the specified template
  static formatPromptWithTemplate(
    history: string,
    currentMessage: string,
    characterName: string,
    template: Template | null
  ): string {
    // Strip HTML from the current message
    const cleanMessage = this.stripHtmlTags(currentMessage);

    if (!template) {
      // Default to a Mistral-like format if no template provided
      return `${history}\n[INST] ${cleanMessage} [/INST]\n${characterName}:`;
    }

    try {
      // Format user message
      const userFormatted = this.replaceVariables(template.userFormat, {
        content: cleanMessage
      });

      // Format assistant message start
      const assistantFormatted = this.replaceVariables(template.assistantFormat, {
        content: '',
        char: characterName
      });

      // Combine to create the complete prompt
      return `${history}\n${userFormatted}\n${assistantFormatted}`;
    } catch (error) {
      console.error('Error formatting prompt:', error);
      // Fallback to a basic format
      return `${history}\n[INST] ${cleanMessage} [/INST]\n${characterName}:`;
    }
  }

  /**
   * Format chat history into proper template format, ensuring edited messages are used
   * and thinking messages are filtered out
   */
  static formatChatHistory(
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'thinking', content: string, variations?: string[], currentVariation?: number }>,
    characterName: string,
    templateId?: string
  ): string {
    if (!messages || messages.length === 0) return '';

    const template = this.getTemplate(templateId);
    if (DEBUG) console.log('Formatting chat history with template:', template?.name || 'Default');

    // Process each message to ensure we use the latest edited version,
    // and handle thinking messages specially
    const processedMessages = messages
      .filter(msg => msg.role !== 'thinking') // Filter out thinking messages from normal history
      .map(msg => {
        // If the message has variations and a currentVariation index, use that content
        let finalContent = msg.content;
        if (msg.variations && msg.variations.length > 0 &&
          typeof msg.currentVariation === 'number' &&
          msg.variations[msg.currentVariation]) {
          finalContent = msg.variations[msg.currentVariation];
        }

        // Strip HTML tags to ensure clean text for the API
        const cleanContent = this.stripHtmlTags(finalContent);

        return {
          role: msg.role,
          content: cleanContent
        };
      });

    if (!template) {
      // Fallback formatting if no template found
      return processedMessages
        .map(msg => {
          const { role, content } = msg;
          if (role === 'assistant') {
            return `${characterName}: ${content}`;
          } else {
            return content;
          }
        })
        .join('\n\n');
    }

    try {
      return processedMessages
        .map(msg => {
          const { role, content } = msg;

          if (role === 'assistant') {
            return this.replaceVariables(template.assistantFormat, {
              content,
              char: characterName
            });
          } else if (role === 'system' && template.systemFormat) {
            return this.replaceVariables(template.systemFormat, {
              content
            });
          } else {
            return this.replaceVariables(template.userFormat, {
              content
            });
          }
        })
        .join('\n');
    } catch (error) {
      console.error('Error formatting chat history:', error);
      // Fallback formatting
      return processedMessages
        .map(msg => {
          const { role, content } = msg;
          if (role === 'assistant') {
            return `${characterName}: ${content}`;
          } else {
            return content;
          }
        })
        .join('\n\n');
    }
  }

  /**
   * Format messages for compression prompt
   */
  private static formatMessagesForCompression(
    messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    characterName: string
  ): string {
    return messages
      .map(msg => {
        const role = msg.role === 'assistant' ? characterName : msg.role === 'user' ? 'User' : 'System';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Compress old messages into a summary using the configured API
   */
  private static async compressMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    characterName: string,
    apiConfig: any,
    signal?: AbortSignal
  ): Promise<string> {
    const systemPrompt = `You are a context compressor for a roleplay chat. Summarize the following messages into a concise narrative that preserves:
- Key plot events and decisions
- Character emotional states and relationship changes
- Established facts about the world/setting
- Any commitments, promises, or plans made

Write in past tense, third person. Be concise but do not lose critical details.
Do not editorialize or add interpretation. Just the facts of what happened.`;

    const userPrompt = `Compress these messages:\n\n${this.formatMessagesForCompression(messages, characterName)}`;

    // Build a simple payload for compression
    const payload = {
      api_config: apiConfig,
      generation_params: {
        prompt: `${systemPrompt}\n\n${userPrompt}\n\nSummary:`,
        memory: '',
        stop_sequence: [],
        quiet: true
      }
    };

    if (DEBUG) console.log('Calling compression API...');
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      throw new Error(`Compression API failed with status ${response.status}`);
    }

    // Collect the full response from the stream
    let compressedText = '';
    for await (const chunk of this.streamResponse(response)) {
      compressedText += chunk;
    }

    if (DEBUG) console.log('Compression complete, length:', compressedText.length);
    return compressedText.trim();
  }

  /**
   * Generates a chat response using the provided parameters.
   * Routes to the working /api/generate endpoint with proper payload structure.
   *
   * @deprecated Use chatService.generateResponse() directly with context from ContextSerializer.
   * Migration:
   * ```typescript
   * import { useContextSnapshot } from '../hooks/useContextSnapshot';
   * import { chatService } from '../services/chat/chatService';
   *
   * const { getSerializedContext } = useContextSnapshot({ ... });
   * const serialized = getSerializedContext();
   * const response = await chatService.generateResponse({
   *   chatSessionUuid,
   *   messages: serialized.formattedHistory,
   *   apiConfig,
   *   ...
   * });
   * ```
   */
  public static async generateChatResponse(
    chatSessionUuid: string, // For context tracking and save operations
    contextMessages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    apiConfig: any, // API configuration for LLM generation
    signal?: AbortSignal,
    characterCard?: CharacterCard, // Optional: for stop sequences and prompt formatting
    sessionNotes?: string, // Optional: user notes to inject into context
    compressionLevel?: CompressionLevel, // Optional: compression level for intelligent context management
    compressedContextCache?: CompressedContextCache | null, // Optional: cached compression result for performance
    onCompressionStart?: () => void, // Optional: callback when compression starts
    onCompressionEnd?: () => void, // Optional: callback when compression ends
    onPayloadReady?: (payload: any) => void, // Optional: callback with the payload before sending
    continuationText?: string // Optional: for continue — partial assistant text used as generation prefix
  ): Promise<Response> {
    warnDeprecation('generateChatResponse', 'chatService.generateResponse() with ContextSerializer');
    if (!chatSessionUuid) {
      throw new Error("chat_session_uuid is required for chat generation");
    }

    if (!apiConfig) {
      throw new Error("apiConfig is required for LLM generation");
    }

    try {
      // Ghost Request Guard: Prevent sending requests with practically empty context
      if ((!contextMessages || contextMessages.length === 0) && !characterCard?.data?.first_mes) {
        if (DEBUG) console.warn('Blocked potential Ghost Request: No context messages and no character greeting');
        // Return a mocked 400 response to stop processing without crashing UI
        return new Response(JSON.stringify({ error: 'Ghost Request Blocked: Insufficient context' }), { status: 400 });
      }

      // Get template and character info
      const templateId = apiConfig?.templateId;
      const template = this.getTemplate(templateId);
      const characterName = characterCard?.data?.name || 'Character';
      const effectiveCompressionLevel = compressionLevel || 'none';

      // Create memory context for field breakdown / token display (Context Window Modal).
      // The actual memory string is built by the backend from character_data.
      let memoryResult: MemoryContextResult | null = null;
      if (characterCard?.data) {
        memoryResult = this.createMemoryContext(
          characterCard,
          template,
          'User',
          effectiveCompressionLevel,
          contextMessages.length
        );
      }

      // Smart compression caching logic
      let compressedContext = '';
      let messagesToFormat = contextMessages;
      let updatedCache: CompressedContextCache | null = compressedContextCache || null;

      // Determine if we need to compress/re-compress
      const shouldCompress = effectiveCompressionLevel !== 'none' && contextMessages.length > COMPRESSION_THRESHOLD;
      const cacheIsValid = compressedContextCache &&
        compressedContextCache.compressionLevel === effectiveCompressionLevel &&
        compressedContextCache.compressedAtMessageCount > 0 &&
        (contextMessages.length - compressedContextCache.compressedAtMessageCount) < COMPRESSION_REFRESH_THRESHOLD;

      if (shouldCompress) {
        if (DEBUG) console.log(`Smart compression check: ${contextMessages.length} messages (threshold: ${COMPRESSION_THRESHOLD})`);

        const splitPoint = contextMessages.length - RECENT_WINDOW;
        const recentMessages = contextMessages.slice(splitPoint);

        if (cacheIsValid) {
          // Use cached compression result
          if (DEBUG) console.log(`Using cached compression from message ${compressedContextCache!.compressedAtMessageCount}`);
          compressedContext = `[Previous Events Summary]\n${compressedContextCache!.compressedText}\n[End Summary - Recent conversation follows]`;
          messagesToFormat = recentMessages;
        } else {
          // Need to compress (or re-compress)
          const oldMessages = contextMessages.slice(0, splitPoint);
          if (DEBUG) console.log(`${cacheIsValid ? 'Re-compressing' : 'Compressing'}: ${oldMessages.length} old messages, ${recentMessages.length} recent messages`);

          try {
            // Notify that compression is starting
            if (onCompressionStart) {
              onCompressionStart();
            }

            // Compress old messages
            const compressed = await this.compressMessages(
              oldMessages,
              characterName,
              apiConfig,
              signal
            );

            compressedContext = `[Previous Events Summary]\n${compressed}\n[End Summary - Recent conversation follows]`;
            messagesToFormat = recentMessages;

            // Update cache with new compression result
            updatedCache = {
              compressedText: compressed,
              compressedAtMessageCount: oldMessages.length,
              compressionLevel: effectiveCompressionLevel,
              timestamp: Date.now()
            };

            if (DEBUG) console.log('Compression successful, cache updated');
          } catch (error) {
            console.error('Compression failed, using full context:', error);
            // Fallback: use uncompressed messages (current behavior)
            messagesToFormat = contextMessages;
            compressedContext = '';
            updatedCache = null; // Invalidate cache on compression failure
          } finally {
            // Notify that compression is done
            if (onCompressionEnd) {
              onCompressionEnd();
            }
          }
        }
      } else if (effectiveCompressionLevel !== 'none') {
        if (DEBUG) console.log(`Compression enabled but below threshold (${contextMessages.length} < ${COMPRESSION_THRESHOLD})`);
      }

      // Build post-history instructions block (session notes + card post_history_instructions).
      // Injected right before the {{char}}: suffix — the strongest prompt position.
      let postHistoryBlock = '';
      const cardPostHistory = characterCard?.data?.post_history_instructions?.trim() || '';
      const trimmedNotes = sessionNotes?.trim() || '';
      if (cardPostHistory || trimmedNotes) {
        const parts: string[] = [];
        if (cardPostHistory) parts.push(cardPostHistory);
        if (trimmedNotes) parts.push(trimmedNotes);
        // Wrapped in markers so the KoboldCPP backend can extract and reposition them
        postHistoryBlock = `[Session Notes]\n${parts.join('\n')}\n[End Session Notes]`;
        if (DEBUG) console.log('Post-history instructions:', postHistoryBlock);
      }

      // Format conversation history using the template system
      const prompt = this.formatChatHistory(
        messagesToFormat.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        })),
        characterName,
        templateId
      );

      // Combine: compressed context → conversation history → post-history instructions → {{char}}:
      // Post-history sits right before the generation suffix (strongest position for behavioral steering)
      let finalPrompt = '';

      if (compressedContext) {
        finalPrompt += `${compressedContext}\n\n`;
      }

      finalPrompt += prompt;

      // Ensure we don't send an empty prompt if history is empty (e.g. first message)
      if (!finalPrompt.trim()) {
        finalPrompt = `${characterName}:`;
      }

      // Inject post-history instructions right before the character turn marker
      if (postHistoryBlock) {
        finalPrompt += `\n${postHistoryBlock}`;
      }

      // Inject ghost suffix to prevent model from writing user's actions/dialogue
      // This invisible turn marker nudges the model to continue as the character
      // For continuation: append partial text so model continues mid-stream
      if (characterCard) {
        if (continuationText) {
          finalPrompt += `\n${characterName}: ${continuationText}`;
          if (DEBUG) console.log('Continuation prefix injected:', `\\n${characterName}: ${continuationText.slice(-50)}`);
        } else {
          finalPrompt += `\n${characterName}:`;
          if (DEBUG) console.log('Ghost suffix injected:', `\\n${characterName}:`);
        }
      }

      const currentUserProfile = ChatStorage.getCurrentUser();
      const resolvedUserName = currentUserProfile?.name || 'User';
      const userPersona = currentUserProfile?.description?.trim() || '';

      // Get stop sequences from template or use defaults
      const stopSequences = PromptHandler.getStopSequences(template, characterName, resolvedUserName);

      // Compute excluded fields from field expiration breakdown
      const excludedFields = memoryResult?.fieldBreakdown
        .filter(f => f.status === 'expired').map(f => f.fieldKey) || [];

      // Build the payload for /api/generate endpoint
      // Extract only essential character data without lore book
      const essentialCharacterData = characterCard ? {
        spec: characterCard.spec,
        spec_version: characterCard.spec_version,
        data: {
          name: characterCard.data.name,
          description: characterCard.data.description,
          personality: characterCard.data.personality,
          scenario: characterCard.data.scenario,
          first_mes: characterCard.data.first_mes,
          mes_example: characterCard.data.mes_example,
          system_prompt: characterCard.data.system_prompt,
          post_history_instructions: characterCard.data.post_history_instructions,
          character_uuid: characterCard.data.character_uuid,
          tags: characterCard.data.tags,
          creator: characterCard.data.creator,
          character_version: characterCard.data.character_version,
          // Explicitly exclude character_book - lore matching should happen on backend
          // Explicitly exclude alternate_greetings - only selected greeting is sent in chat_history
        }
      } : null;

      const payload = {
        api_config: apiConfig,
        generation_params: {
          // Fix: Spread user generation settings (like banned_tokens) so they aren't lost
          ...(apiConfig.generation_settings || {}),
          prompt: finalPrompt,
          // Backend builds memory from character_data — send excluded_fields instead
          excluded_fields: excludedFields,
          user_name: resolvedUserName,
          ...(userPersona ? { user_persona: userPersona } : {}),
          stop_sequence: stopSequences,
          chat_session_uuid: chatSessionUuid, // Include for potential backend use
          character_data: essentialCharacterData, // Essential character data only, no lore book
          chat_history: contextMessages, // Include for backend context processing
          ...(continuationText ? { continuation_text: continuationText } : {}), // For continue: backend uses as generation prefix
          generation_type: apiConfig._generation_type || 'generate', // LogitShaper: distinguish regen/continue from new turns
          quiet: true
        }
      };

      // Log payload for verification
      if (DEBUG && sessionNotes && sessionNotes.trim()) {
        console.log('Payload with notes:', JSON.stringify(payload, null, 2));
      }

      // Call the payload callback if provided (for debugging/inspection and context window display)
      if (onPayloadReady) {
        onPayloadReady({
          ...payload,
          // Memory preview for Context Window Modal (backend builds the real one)
          displayMemory: memoryResult?.memory || '',
          // Add field breakdown for token analysis modal
          fieldBreakdown: memoryResult?.fieldBreakdown || [],
          savedTokens: memoryResult?.savedTokens || 0,
          // Include updated compression cache for ChatContext to store
          compressedContextCache: updatedCache
        });
      }

      // Make the actual API request to the working streaming endpoint
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal // Pass the abort signal for cancellation
      });

      return response;
    } catch (error) {
      console.error('Error generating chat response:', error);
      throw error;
    }
  }

  /**
   * Helper method to format prompt with context messages
   */
  public static formatPromptWithContextMessages( // Changed to public
    character: CharacterCard,
    prompt: string,
    // Accept broader role type as filtering happens before call
    contextMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'thinking', content: string }>,
    userName: string, // Added userName
    templateId?: string
  ): string {
    const template = this.getTemplate(templateId);
    const characterName = character.data.name || 'Character';
    const currentUser = userName || 'User'; // Fallback if userName is empty

    // Create the memory context - use defaults for compression
    const memoryResult = this.createMemoryContext(character, template, currentUser, 'none', 0);
    const memoryContext = memoryResult.memory;

    // Format the history from context messages
    let history = '';
    if (contextMessages.length > 0) {
      history = contextMessages
        .map(msg => {
          const messageVariables = {
            content: msg.content,
            char: characterName,
            user: currentUser
          };
          if (!template) {
            // Fallback formatting if no template
            if (msg.role === 'assistant') {
              return this.replaceVariables(`{{char}}: {{content}}`, messageVariables);
            } else if (msg.role === 'system') {
              return this.replaceVariables(`[System: {{content}}]`, messageVariables);
            } else { // user role
              return this.replaceVariables(`{{user}}: {{content}}`, messageVariables);
            }
          }

          if (msg.role === 'assistant') {
            return this.replaceVariables(template.assistantFormat || '{{char}}: {{content}}', messageVariables);
          } else if (msg.role === 'system' && template.systemFormat) {
            return this.replaceVariables(template.systemFormat, messageVariables);
          } else { // user role
            return this.replaceVariables(template.userFormat || '{{user}}: {{content}}', messageVariables);
          }
        })
        .join('\n');
    }

    // Combine everything into a complete prompt
    const currentUserPromptFormatted = template?.userFormat
      ? this.replaceVariables(template.userFormat, { content: prompt, user: currentUser, char: characterName })
      : this.replaceVariables(`{{user}}: {{content}}`, { content: prompt, user: currentUser });

    const assistantPrefixFormatted = template?.assistantFormat
      ? this.replaceVariables(template.assistantFormat, { content: '', char: characterName, user: currentUser })
      : this.replaceVariables(`{{char}}:`, { char: characterName });

    const fullPrompt = `${memoryContext}\n\n${history}\n\n${currentUserPromptFormatted}\n\n${assistantPrefixFormatted}`;

    return fullPrompt;
  }

  /**
   * Async generator for streaming content from a response.
   * Use this method to iterate over streaming content from an API response.
   * @param response The response to stream from
   * @param characterName Optional character name to strip from the first chunk (ghost suffix removal)
   */
  public static async *streamResponse(response: Response, characterName?: string): AsyncGenerator<string, void, unknown> {
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let isFirstChunk = true;

    /**
     * Helper function to strip character name from the first chunk
     * This removes the echoed ghost suffix from the response
     */
    const stripCharacterMarker = (text: string): string => {
      if (!isFirstChunk || !characterName || !text) {
        return text;
      }

      isFirstChunk = false;

      // Escape special regex characters in character name
      const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Strip leading character marker (case-insensitive, with optional whitespace)
      const regex = new RegExp(`^\\s*${escapedName}\\s*:\\s*`, 'i');
      const stripped = text.replace(regex, '');

      if (stripped !== text && DEBUG) {
        console.log(`Ghost suffix stripped from first chunk: "${text.substring(0, 50)}..." → "${stripped.substring(0, 50)}..."`);
      }

      return stripped;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process lines in buffer
        let lineEnd;
        while ((lineEnd = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, lineEnd).trim();
          buffer = buffer.substring(lineEnd + 1);

          if (!line) continue;

          // Check if it's SSE format (data: prefix)
          if (line.startsWith('data: ')) {
            const data = line.substring(6);

            // Handle completion marker
            if (data === '[DONE]') {
              if (DEBUG) console.log('Stream complete marker received');
              continue;
            }
            try {
              // Parse the JSON data
              const parsed = JSON.parse(data);
              if (DEBUG) console.log(`[PromptHandler.streamResponse] Parsed data:`, parsed);

              // Log first chunk for debugging (optional)
              if (parsed.delta_type === 'role' && parsed.role === 'assistant') {
                if (DEBUG) console.log('[OpenRouter] Received role marker for assistant');
                continue; // Skip yielding for role-only chunks
              }

              // Handle OpenRouter-specific token format from our improved adapter
              if (parsed.token !== undefined) {
                if (DEBUG) console.log(`[PromptHandler.streamResponse] Yielding token: "${parsed.token}"`);
                yield stripCharacterMarker(parsed.token);
                continue;
              }

              // Handle Featherless adapter specific format
              if (parsed.raw_featherless_payload !== undefined) {
                try {
                  // Try to parse the raw payload from Featherless
                  const featherlessData = JSON.parse(parsed.raw_featherless_payload);

                  // Handle chat completions format
                  if (featherlessData.choices && featherlessData.choices[0]) {
                    if (featherlessData.choices[0].message && featherlessData.choices[0].message.content) {
                      // This is from /v1/chat/completions endpoint
                      yield stripCharacterMarker(featherlessData.choices[0].message.content);
                      continue;
                    } else if (featherlessData.choices[0].delta && featherlessData.choices[0].delta.content) {
                      // This is from streaming version like OpenAI API
                      yield stripCharacterMarker(featherlessData.choices[0].delta.content);
                      continue;
                    } else if (featherlessData.choices[0].text) {
                      // This is from /v1/completions endpoint
                      yield stripCharacterMarker(featherlessData.choices[0].text);
                      continue;
                    }
                  }

                  // If no specific format matched but we have content field as fallback
                  if (featherlessData.content) {
                    yield stripCharacterMarker(featherlessData.content);
                    continue;
                  }

                  if (DEBUG) console.log('Unrecognized Featherless response format:', featherlessData);
                } catch (parseError) {
                  // If the raw payload isn't valid JSON, just use it directly
                  console.warn('Could not parse Featherless raw payload:', parseError);
                  yield stripCharacterMarker(parsed.raw_featherless_payload);
                }
                continue;
              }
              // Handle different response formats
              // OpenAI and OpenRouter format: choices[0].delta.content
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                yield stripCharacterMarker(parsed.choices[0].delta.content);
                continue;
              }
              // KoboldCPP and other formats - check for content field
              if (parsed.hasOwnProperty('content')) {
                // Even if content is empty string, yield it (it's valid)
                if (DEBUG) console.log(`[PromptHandler.streamResponse] Yielding content: "${parsed.content}"`);
                yield stripCharacterMarker(parsed.content);
                continue;
              }

              // Handle special formats with empty content that should be skipped
              if (parsed.delta_type === 'empty_delta' || parsed.delta_type === 'processing') {
                if (DEBUG) console.log(`[PromptHandler.streamResponse] Skipping empty delta: ${parsed.delta_type}`);
                continue;
              }

              // If we can't extract content in a standard way, log the format for debugging
              console.warn('Unrecognized response format:', parsed);
              console.warn('Parsed content:', parsed.content);
              console.warn('Has content property:', parsed.hasOwnProperty('content'));
              console.warn('Has token property:', parsed.hasOwnProperty('token'));
            } catch (error) {
              console.warn('Failed to parse SSE data:', error);
              // Just yield the raw data if parsing fails
              yield stripCharacterMarker(data);
            }
          } else {
            // Non-SSE format, yield as is
            yield stripCharacterMarker(line);
          }
        }
      }

      // Don't forget any remaining content in the buffer
      if (buffer.trim()) {
        yield stripCharacterMarker(buffer.trim());
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Get stop sequences from template or use defaults
  public static getStopSequences(template: Template | null, characterName: string, userName: string = 'User'): string[] {
    const defaultStopSequences = [
      // Stop when the model tries to speak as the user — never on the character's
      // own name, which was causing premature truncation of multi-paragraph responses.
      `\n${userName}:`,
      "\nUser:",
      "\nAssistant:",
    ];

    if (!template || !template.stopSequences || template.stopSequences.length === 0) {
      return defaultStopSequences;
    }

    // Replace {{char}} and {{user}} in stop sequences with actual names
    return template.stopSequences.map(seq =>
      seq.replace(/\{\{char\}\}/g, characterName)
         .replace(/\{\{user\}\}/g, userName)
    );
  }
}