// handlers/promptHandler.ts
import { CharacterCard } from '../types/schema';
import { templateService } from '../services/templateService';
import { Template } from '../types/templateTypes';

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
  public static createMemoryContext(character: CharacterCard, template: Template | null, userName?: string): string {
    console.log('Creating memory context with template:', template?.name || 'No template', 'User:', userName);
    const currentUser = userName || 'User'; // Fallback for user name

    if (!template || !template.memoryFormat) {
      // Default memory format if no template or template has no memoryFormat
      let scenario = character.data.scenario || '';
      // Manually replace {{user}} in default scenario for robustness
      scenario = scenario.replace(/\{\{user\}\}/g, currentUser);

      const defaultMemory = `${character.data.system_prompt || ''}
Persona: ${character.data.description || ''}
Personality: ${character.data.personality || ''}
[Scenario: ${scenario}]
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
        examples: character.data.mes_example || '',
        user: currentUser // Add user to variables
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
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'thinking', content: string, variations?: string[], currentVariation?: number }>,
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

  /**
   * Generates a chat response using the provided parameters.
   * Routes to the working /api/generate endpoint with proper payload structure.
   */
  public static async generateChatResponse(
    chatSessionUuid: string, // For context tracking and save operations
    contextMessages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    apiConfig: any, // API configuration for LLM generation
    signal?: AbortSignal,
    characterCard?: CharacterCard // Optional: for stop sequences and prompt formatting
  ): Promise<Response> {
    if (!chatSessionUuid) {
      throw new Error("chat_session_uuid is required for chat generation");
    }
    
    if (!apiConfig) {
      throw new Error("apiConfig is required for LLM generation");
    }
    
    try {
      // Build the prompt from context messages and character data
      let prompt = '';
      let memory = '';
      
      // Extract character information for prompt building
      if (characterCard?.data) {
        const characterName = characterCard.data.name || 'Character';
        const characterDescription = characterCard.data.description || '';
        const personality = characterCard.data.personality || '';
        const scenario = characterCard.data.scenario || '';
        const systemPrompt = characterCard.data.system_prompt || '';
        
        // Build memory/system context
        memory = `Character: ${characterName}\n`;
        if (characterDescription) memory += `Description: ${characterDescription}\n`;
        if (personality) memory += `Personality: ${personality}\n`;
        if (scenario) memory += `Scenario: ${scenario}\n`;
        if (systemPrompt) memory += `${systemPrompt}\n`;
      }
      
      // Build conversation history into prompt
      const conversationHistory = contextMessages.map(msg => {
        const role = msg.role === 'user' ? 'User' : 
                    msg.role === 'assistant' ? (characterCard?.data?.name || 'Assistant') : 
                    'System';
        return `${role}: ${msg.content}`;
      }).join('\n');
      
      prompt = conversationHistory;
      
      // Get stop sequences from template or use defaults
      const templateId = apiConfig?.templateId;
      const template = this.getTemplate(templateId);
      const characterName = characterCard?.data?.name || 'Character';
      const stopSequences = this.getStopSequences(template, characterName);
      
      // Build the payload for /api/generate endpoint
      const payload = {
        api_config: apiConfig,
        generation_params: {
          prompt: prompt,
          memory: memory,
          stop_sequence: stopSequences,
          chat_session_uuid: chatSessionUuid, // Include for potential backend use
          character_data: characterCard, // Include for lore matching and context
          chat_history: contextMessages, // Include for backend context processing
          quiet: true
        }
      };

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

    // Create the memory context - this might also need {{user}}
    const memoryContext = this.createMemoryContext(character, template, currentUser); // Pass currentUser here

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
   */
  public static async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    if (!response.body) {
      throw new Error('Response body is empty');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
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
              console.log('Stream complete marker received');
              continue;
            }
              try {
              // Parse the JSON data
              const parsed = JSON.parse(data);
              console.log(`[PromptHandler.streamResponse] Parsed data:`, parsed);
              
              // Log first chunk for debugging (optional)
              if (parsed.delta_type === 'role' && parsed.role === 'assistant') {
                console.log('[OpenRouter] Received role marker for assistant');
                continue; // Skip yielding for role-only chunks
              }
              
              // Handle OpenRouter-specific token format from our improved adapter
              if (parsed.token !== undefined) {
                console.log(`[PromptHandler.streamResponse] Yielding token: "${parsed.token}"`);
                yield parsed.token;
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
                      yield featherlessData.choices[0].message.content;
                      continue;
                    } else if (featherlessData.choices[0].delta && featherlessData.choices[0].delta.content) {
                      // This is from streaming version like OpenAI API
                      yield featherlessData.choices[0].delta.content;
                      continue;
                    } else if (featherlessData.choices[0].text) {
                      // This is from /v1/completions endpoint
                      yield featherlessData.choices[0].text;
                      continue;
                    }
                  }
                  
                  // If no specific format matched but we have content field as fallback
                  if (featherlessData.content) {
                    yield featherlessData.content;
                    continue;
                  }
                  
                  console.log('Unrecognized Featherless response format:', featherlessData);
                } catch (parseError) {
                  // If the raw payload isn't valid JSON, just use it directly
                  console.warn('Could not parse Featherless raw payload:', parseError);
                  yield parsed.raw_featherless_payload;
                }
                continue;
              }
                // Handle different response formats
              // OpenAI and OpenRouter format: choices[0].delta.content
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                yield parsed.choices[0].delta.content;
                continue;
              }
                // KoboldCPP and other formats - check for content field
              if (parsed.hasOwnProperty('content')) {
                // Even if content is empty string, yield it (it's valid)
                console.log(`[PromptHandler.streamResponse] Yielding content: "${parsed.content}"`);
                yield parsed.content;
                continue;
              }
              
              // Handle special formats with empty content that should be skipped
              if (parsed.delta_type === 'empty_delta' || parsed.delta_type === 'processing') {
                console.log(`[PromptHandler.streamResponse] Skipping empty delta: ${parsed.delta_type}`);
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
              yield data;
            }
          } else {
            // Non-SSE format, yield as is
            yield line;
          }
        }
      }
      
      // Don't forget any remaining content in the buffer
      if (buffer.trim()) {
        yield buffer.trim();
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Get stop sequences from template or use defaults
  public static getStopSequences(template: Template | null, characterName: string): string[] {
    const defaultStopSequences = [
      // Provide standard stop sequences for chat models
      "\n\nUser:",
      "\n\nAssistant:",
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
}