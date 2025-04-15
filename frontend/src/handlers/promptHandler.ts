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

  // Get stop sequences from template or use defaults
  private static getStopSequences(template: Template | null, characterName: string): string[] {
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