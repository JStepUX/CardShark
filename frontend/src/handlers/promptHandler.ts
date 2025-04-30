// handlers/promptHandler.ts
import { CharacterCard } from '../types/schema';
import { templateService } from '../services/templateService';
import { Template } from '../types/templateTypes';

export class PromptHandler {
  // Removed unused DEFAULT_PARAMS

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
  public static createMemoryContext(character: CharacterCard, template: Template | null): string {
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
   * Overloaded method to support different parameter combinations used throughout the app.
   */
  public static async generateChatResponse(
    characterCard: CharacterCard,
    prompt: string,
    contextMessages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    apiConfig?: any,
    signal?: AbortSignal
  ): Promise<Response> {
    try {
      // Extract character name from the card
      const characterName = characterCard.data.name || 'Character';
      const templateId = apiConfig?.templateId;
      
      // Format the prompt with the provided context messages
      const formattedPrompt = this.formatPromptWithContextMessages(
        characterCard, 
        prompt, 
        contextMessages, 
        templateId
      );
      
      const template = this.getTemplate(templateId);
      const stopSequences = this.getStopSequences(template, characterName);
      
      // Make the actual API request
      const response = await fetch('/api/chat/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: formattedPrompt,
          stop_sequences: stopSequences,
          ...(apiConfig || {})
        }),
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
  private static formatPromptWithContextMessages(
    character: CharacterCard,
    prompt: string,
    contextMessages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    templateId?: string
  ): string {
    const template = this.getTemplate(templateId);
    const characterName = character.data.name || 'Character';
    
    // Create the memory context
    const memoryContext = this.createMemoryContext(character, template);
    
    // Format the history from context messages
    let history = '';
    if (contextMessages.length > 0) {
      history = contextMessages
        .map(msg => {
          if (!template) {
            // Fallback formatting if no template
            if (msg.role === 'assistant') {
              return `${characterName}: ${msg.content}`;
            } else if (msg.role === 'system') {
              return `[System: ${msg.content}]`;
            } else {
              return `User: ${msg.content}`;
            }
          }
          
          if (msg.role === 'assistant') {
            return this.replaceVariables(template.assistantFormat || '{{char}}: {{content}}', { 
              content: msg.content, 
              char: characterName 
            });
          } else if (msg.role === 'system' && template.systemFormat) {
            return this.replaceVariables(template.systemFormat, {
              content: msg.content
            });
          } else {
            return this.replaceVariables(template.userFormat || 'User: {{content}}', { 
              content: msg.content 
            });
          }
        })
        .join('\n');
    }
    
    // Combine everything into a complete prompt
    const fullPrompt = `${memoryContext}\n\n${history}\n\n${
      template?.userFormat 
        ? this.replaceVariables(template.userFormat, { content: prompt })
        : `User: ${prompt}`
    }\n\n${
      template?.assistantFormat 
        ? this.replaceVariables(template.assistantFormat, { content: '', char: characterName })
        : `${characterName}:`
    }`;
    
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
              
              // Handle different response formats
              // OpenAI and OpenRouter format: choices[0].delta.content
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                yield parsed.choices[0].delta.content;
                continue;
              }
              
              // KoboldCPP and other formats
              if (parsed.content) {
                yield parsed.content;
                continue;
              }
              
              // If we can't extract content in a standard way, return the raw data
              console.log('Unrecognized response format:', parsed);
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