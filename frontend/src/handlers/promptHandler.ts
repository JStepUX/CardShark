// handlers/promptHandler.ts
import { CharacterCard } from '../types/schema';
import { APIConfig } from '../types/api';
import { templateService } from '../services/templateService';
import { Template } from '../types/templateTypes';
import { transformKoboldPayload, getKoboldStreamEndpoint, wakeKoboldServer } from '../utils/koboldTransformer';
import { createKoboldStreamWrapper, detectCompletionSignal, extractContentFromText } from '../utils/streamUtils';

export class PromptHandler {
  private static readonly DEFAULT_PARAMS = {
    n: 1,
    max_context_length: 6144,
    max_length: 220,
    rep_pen: 1.07,
    temperature: 1.05,
    top_p: 0.92,
    top_k: 100,
    top_a: 0,
    typical: 1,
    tfs: 1,
    rep_pen_range: 360,
    rep_pen_slope: 0.7,
    sampler_order: [6, 0, 1, 3, 4, 2, 5],
    trim_stop: true,
    min_p: 0,
    dynatemp_range: 0.45,
    dynatemp_exponent: 1,
    smoothing_factor: 0,
    banned_tokens: [],
    render_special: false,
    logprobs: false,
    presence_penalty: 0,
    logit_bias: {},
    quiet: true,
    use_default_badwordsids: false,
    bypass_eos: false
  } as const;

  // Simple variable replacement function
  private static replaceVariables(template: string, variables: Record<string, string>): string {
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
   * Utility function to strip HTML tags from content
   * This ensures clean text is sent to the LLM without HTML markup
   */
  private static stripHtmlTags(content: string): string {
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
  private static getTemplate(templateId?: string): Template | null {
    // If templateId is provided, try to get that template
    if (templateId) {
      console.log(`Looking up template with ID: ${templateId}`);
      const template = templateService.getTemplateById(templateId);
      if (template) {
        console.log(`Found template: ${template.name}`);
        return template;
      } else {
        console.warn(`Template not found for ID: ${templateId}`);
      }
    } else {
      console.warn('No templateId provided');
    }
     
    // Fallback to mistral template or first available
    console.log('Falling back to default template');
    const defaultTemplate = templateService.getTemplateById('mistral') ||
                           templateService.getAllTemplates()[0] ||
                           null;
    
    if (defaultTemplate) {
      console.log(`Using default template: ${defaultTemplate.name}`);
    } else {
      console.error('No templates available');
    }
    
    return defaultTemplate;
  }

  // Create memory context from character data using template
  private static createMemoryContext(character: CharacterCard, template: Template | null): string {
    console.log('Creating memory context with template:', template?.name || 'No template');
    
    if (!template || !template.memoryFormat) {
      // Default memory format if no template or template has no memoryFormat
      const defaultMemory = `${character.data.system_prompt || ''}
Persona: ${character.data.description || ''}
Personality: ${character.data.personality || ''}
[Scenario: ${character.data.scenario || ''}]
${character.data.mes_example || ''}
***`;
      console.log('Using default memory format:', defaultMemory);
      return defaultMemory;
    }

    try {
      // Replace variables in the memory format template
      const variables = {
        system: character.data.system_prompt || '',
        description: character.data.description || '',
        personality: character.data.personality || '',
        scenario: character.data.scenario || '',
        examples: character.data.mes_example || ''
      };

      const formattedMemory = this.replaceVariables(template.memoryFormat, variables);
      console.log('Formatted memory using template:', formattedMemory);
      return formattedMemory.trim(); // Ensure clean formatting
    } catch (error) {
      console.error('Error formatting memory context:', error);
      // Fallback to default format
      return `${character.data.system_prompt || ''}
Persona: ${character.data.description || ''}
Personality: ${character.data.personality || ''}
[Scenario: ${character.data.scenario || ''}]
${character.data.mes_example || ''}
***`;
    }
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
    messages: Array<{ role: 'user' | 'assistant' | 'thinking' | 'system', content: string, variations?: string[], currentVariation?: number }>,
    characterName: string,
    templateId?: string
  ): string {
    if (!messages || messages.length === 0) return '';
    
    const template = this.getTemplate(templateId);
    console.log('Formatting chat history with template:', template?.name || 'Default');
    
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

  // Get stop sequences from template or use defaults
  private static getStopSequences(template: Template | null, characterName: string): string[] {
    const defaultStopSequences = [
      "<|im_end|>\\n<|im_start|>user",
      "<|im_end|>\\n<|im_start|>assistant",
      "User:",
      "Assistant:",
      `${characterName}:`
    ];

    if (!template || !template.stopSequences || template.stopSequences.length === 0) {
      return defaultStopSequences;
    }

    // Replace {{char}} in stop sequences with actual character name
    return template.stopSequences.map(seq => 
      seq.replace(/\{\{char\}\}/g, characterName)
    );
  }

  // Generate chat response with enhanced context tracking and thinking support
  static async generateChatResponse(
    character: CharacterCard,
    currentMessage: string,
    history: Array<{ role: 'user' | 'assistant' | 'system' | 'thinking', content: string }>,
    apiConfig: APIConfig,
    signal?: AbortSignal
  ): Promise<Response> {
    console.log('Starting generation with API Config:', apiConfig);
    console.log('Using templateId:', apiConfig.templateId);

    // Get template based on templateId - must get this right
    const template = this.getTemplate(apiConfig.templateId);
    console.log('Using template:', template?.name || 'Default');

    // Look for thinking content in system messages and strip HTML
    const thinkingContent = history
      .filter(msg => msg.role === 'system' && msg.content.startsWith('<think>'))
      .map(msg => this.stripHtmlTags(msg.content))
      .join('\n');
    
    // Create a special thinking prompt if thinking content exists
    let enhancedPrompt = this.stripHtmlTags(currentMessage);
    if (thinkingContent) {
      // Add thinking to the prompt in a way that encourages the model to use it
      enhancedPrompt = `${thinkingContent}\n\nBased on the above reasoning, respond to: ${enhancedPrompt}`;
    }

    // Create memory context
    const memory = this.createMemoryContext(character, template);

    // Format chat history using the template - filter out thinking messages
    const formattedHistory = this.formatChatHistory(
      history, 
      character.data.name, 
      apiConfig.templateId // Make sure we're passing templateId here
    );
    
    // Create the final prompt using the template with the enhanced prompt
    const currentPrompt = this.formatPromptWithTemplate(
      formattedHistory,
      enhancedPrompt, // Use the enhanced prompt that may include thinking
      character.data.name,
      template
    );

    // Get stop sequences from template
    const stopSequences = this.getStopSequences(template, character.data.name);

    // Extract template format properties for passing to the backend
    let template_format = null;
    if (template) {
      // Split the templates to extract start/end parts
      const userParts = template.userFormat.split('{{content}}');
      const assistantParts = template.assistantFormat.split('{{content}}');
      // Clean up the assistant start by removing character name placeholder
      let assistantStart = assistantParts[0] || '';
      assistantStart = assistantStart.replace('{{char}}:', '');

      template_format = {
        name: template.name,
        id: template.id,
        system_start: template.systemFormat?.split('{{content}}')[0] || '',
        system_end: template.systemFormat?.split('{{content}}')[1] || '',
        user_start: userParts[0] || '',
        user_end: userParts[1] || '',
        assistant_start: assistantStart,
        assistant_end: assistantParts[1] || ''
      };
    }

    // Capture raw context information for debugging
    const contextInfo = {
      timestamp: new Date().toISOString(),
      type: 'generation',
      characterName: character.data.name,
      systemPrompt: character.data.system_prompt,
      description: character.data.description,
      personality: character.data.personality,
      scenario: character.data.scenario,
      memory,
      historyLength: history.length,
      currentMessage,
      enhancedPrompt: enhancedPrompt !== currentMessage ? enhancedPrompt : undefined,
      thinkingIncluded: thinkingContent.length > 0,
      formattedPrompt: currentPrompt,
      template: {
        id: template?.id || 'default',
        name: template?.name || 'Default',
      },
      config: {
        ...apiConfig,
        // Don't include sensitive info like API keys in logs
        apiKey: apiConfig.apiKey ? "[REDACTED]" : null,
        provider: apiConfig.provider,
        url: apiConfig.url,
        model: apiConfig.model,
        templateId: apiConfig.templateId, // Make sure this is included
        max_context_length: apiConfig.generation_settings?.max_context_length || this.DEFAULT_PARAMS.max_context_length,
        max_length: apiConfig.generation_settings?.max_length || this.DEFAULT_PARAMS.max_length
      }
    };
    
    // Log the context info for debugging
    console.log('Context info:', JSON.stringify(contextInfo, null, 2));

    // Create the API request payload with the full generation_settings object
    const apiPayload = {
      api_config: {
        url: apiConfig.url,
        apiKey: apiConfig.apiKey,
        provider: apiConfig.provider,
        model: apiConfig.model,
        templateId: apiConfig.templateId, // Use templateId, not template
        template_format: template_format, // Include template format info separately
        generation_settings: apiConfig.generation_settings || {} // Pass full generation_settings
      },
      generation_params: {
        memory,
        prompt: currentPrompt,
        stop_sequence: stopSequences,
        context_window: contextInfo, // Add the debugging context window
        character_data: character, // Pass character data for lore entry matching
        chat_history: history,     // Pass chat history for lore matching
        current_message: enhancedPrompt, // Pass enhanced message that may contain thinking
        has_thinking: thinkingContent.length > 0 // Flag to indicate if thinking was included
      }
    };

    // Log detailed information about generation settings
    console.log('API payload with generation settings:', 
      JSON.stringify({
        ...apiPayload,
        api_config: {
          ...apiPayload.api_config,
          apiKey: '[REDACTED]' // Don't log the API key
        }
      }, null, 2)
    );

    // Direct API call for KoboldCPP
    if (apiConfig.provider === 'KoboldCPP') {
      try {
        // Try to wake the server first if it might be sleeping
        if (apiConfig.url) {
          try {
            await wakeKoboldServer(apiConfig.url);
          } catch (err) {
            console.warn('Failed to wake KoboldCPP server, continuing anyway', err);
          }
        }
        
        // Transform to KoboldCPP format
        const koboldPayload = transformKoboldPayload(apiPayload);
        
        // Log for debugging (but redact API keys)
        console.log('Transformed KoboldCPP payload:', JSON.stringify({
          ...koboldPayload,
          apiKey: koboldPayload.apiKey ? '[REDACTED]' : undefined
        }, null, 2));
        
        // Get the endpoint URL
        const endpoint = getKoboldStreamEndpoint(apiConfig.url || '');
        console.log('Using KoboldCPP direct endpoint:', endpoint);
        
        // Make the direct request to KoboldCPP with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        
        // Merge the signals if both exist
        const combinedSignal = signal 
          ? { signal: AbortSignal.any([signal, controller.signal]) } 
          : { signal: controller.signal };
        
        // Expanded logging about signals for debugging
        console.log('KoboldCPP request with signal:', {
          hasUserSignal: !!signal,
          hasTimeoutSignal: !!controller.signal,
          usingCombinedSignal: !!signal
        });
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(koboldPayload),
          ...combinedSignal
        });
        
        clearTimeout(timeoutId);
        
        // Add special handling to improve response parsing for KoboldCPP
        const originalBody = response.body;
        if (originalBody) {
          // Use the new utility function to create the stream wrapper
          return new Response(
            createKoboldStreamWrapper(originalBody, signal),
            response
          );
        }
        
        return response;
      } catch (err) {
        // Convert fetch errors to proper Response objects
        console.error('KoboldCPP fetch error:', err);
        return new Response(
          JSON.stringify({ error: { message: err instanceof Error ? err.message : 'KoboldCPP connection failed' } }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // For other providers, use the original endpoint/approach
    return fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apiPayload),
      signal
    });
  }

  static async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
    if (!response.body) throw new Error('No response body');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      console.log('Starting to read SSE stream');
      let buffer = '';
      let chunkSize = 0;
      let lastChunkTime = Date.now();
      const MAX_IDLE_TIME = 3000; // 3 seconds timeout for detecting end of stream
      
      while (true) {
        // Check for timeout since last chunk - new addition to detect stalled streams
        const currentTime = Date.now();
        if (chunkSize > 0 && (currentTime - lastChunkTime) > MAX_IDLE_TIME) {
          console.log(`Stream appears complete (${MAX_IDLE_TIME}ms without data)`);
          break;
        }
        
        // Read the next chunk with timeout
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          const readPromise = reader.read();
          const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
            setTimeout(() => reject(new Error('Stream read timeout')), MAX_IDLE_TIME);
          });
          
          readResult = await Promise.race([readPromise, timeoutPromise]);
          lastChunkTime = Date.now(); // Update last chunk time
        } catch (err) {
          if (err instanceof Error && err.message === 'Stream read timeout') {
            console.log('Stream read timeout - assuming completion');
            break;
          }
          throw err;
        }
        
        const { value, done } = readResult;
        
        if (done) { // Continue processing other chunks, don't break yet
          console.log('Stream complete (done flag)');
          break;
        }
        
        // Decode only once per chunk
        const decodedChunk = decoder.decode(value, { stream: true });
        buffer += decodedChunk;
        chunkSize += decodedChunk.length;
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        // Keep the last line which might be incomplete
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith('data: ')) {
            try {
              const dataText = line.slice(6); // Remove 'data: ' prefix
              
              // Handle "[DONE]" specifically
              if (dataText.includes('[DONE]')) {
                console.log('Received [DONE] signal');
                continue; // Continue processing other chunks, don't break yet
              }
              
              // Check for completion signals using the utility function
              const isCompletionSignal = detectCompletionSignal(dataText);
              
              if (isCompletionSignal) {
                console.log(`Detected specific completion signal: ${dataText}`);
                // Don't terminate yet, continue processing this chunk and mark for completion after
                setTimeout(() => { lastChunkTime = 0; }, 100);
              }
              
              // Extract and yield content
              const content = extractContentFromText(dataText);
              if (content) yield content;
            } catch (e) {
              console.error('Error processing SSE line:', e, line);
            }
          }
        }
      }
      
      // Final processing of any remaining buffer content
      if (buffer.trim()) {
        try {
          if (buffer.startsWith('data: ')) {
            const dataText = buffer.slice(6);
            if (!dataText.includes('[DONE]')) {
              try {
                const data = JSON.parse(dataText);
                if (data.token) yield data.token;
                else if (data.content) yield data.content;
                else if (data.choices && data.choices.length > 0) {
                  const content = data.choices[0].delta?.content || data.choices[0].text || '';
                  if (content) yield content;
                }
              } catch (e) {
                console.error('Error parsing final buffer JSON:', e);
                // Try direct string extraction if JSON parsing fails
                if (dataText && typeof dataText === 'string') {
                  console.log('Attempting direct extraction from final buffer');
                  const contentMatch = dataText.match(/"content":"([^"]+)"/);
                  const textMatch = dataText.match(/"text":"([^"]+)"/);
                  if (contentMatch && contentMatch[1]) {
                    yield contentMatch[1];
                  } else if (textMatch && textMatch[1]) {
                    yield textMatch[1];
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('Error processing final buffer:', e);
        }
      }
      
      console.log('Stream processing complete');
    } finally {
      // Release the reader lock when done
      reader.releaseLock();
    }
  }
}