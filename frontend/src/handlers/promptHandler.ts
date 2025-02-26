// Updated handlers/promptHandler.ts to use templateService without Handlebars
import { CharacterCard } from '../types/schema';
import { APIConfig } from '../types/api';
import { templateService } from '../services/templateService';
import { Template } from '../types/templateTypes';

export class PromptHandler {
  // Default generation parameters matching KoboldCPP exactly
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
    let result = template;
    
    // Replace each variable in the template
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    });
    
    return result;
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
    if (!template || !template.memoryFormat) {
      // Default memory format if no template or template has no memoryFormat
      return `${character.data.system_prompt || ''}
Persona: ${character.data.description || ''}
Personality: ${character.data.personality || ''}
[Scenario: ${character.data.scenario || ''}]
${character.data.mes_example || ''}
***`;
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

      return this.replaceVariables(template.memoryFormat, variables);
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
    if (!template) {
      // Default to a Mistral-like format if no template provided
      return `${history}\n[INST] ${currentMessage} [/INST]\n${characterName}:`;
    }

    try {
      // Format user message
      const userFormatted = this.replaceVariables(template.userFormat, { 
        content: currentMessage 
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
      return `${history}\n[INST] ${currentMessage} [/INST]\n${characterName}:`;
    }
  }

  // Format chat history into proper template format
  static formatChatHistory(
    messages: Array<{ role: 'user' | 'assistant', content: string }>,
    characterName: string,
    templateId?: string
  ): string {
    if (!messages || messages.length === 0) return '';
    
    const template = this.getTemplate(templateId);
    if (!template) {
      // Fallback formatting if no template found
      return messages
        .map(msg => {
          const { role, content } = msg;
          if (role === 'assistant') {
            return `[INST] ${characterName}: ${content} [/INST]`;
          } else {
            return `[INST] ${content} [/INST]`;
          }
        })
        .join('\n');
    }

    try {
      return messages
        .map(msg => {
          const { role, content } = msg;
          
          if (role === 'assistant') {
            return this.replaceVariables(template.assistantFormat, { 
              content, 
              char: characterName 
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
      return messages
        .map(msg => {
          const { role, content } = msg;
          if (role === 'assistant') {
            return `[INST] ${characterName}: ${content} [/INST]`;
          } else {
            return `[INST] ${content} [/INST]`;
          }
        })
        .join('\n');
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

  // Generate chat response with enhanced context tracking
  static async generateChatResponse(
    character: CharacterCard,
    currentMessage: string,
    history: Array<{ role: 'user' | 'assistant', content: string }>,
    apiConfig: APIConfig,
    signal?: AbortSignal
  ): Promise<Response> {
    console.log('Starting generation...');
    console.log('API Config:', apiConfig);

    // Get template based on templateId
    const template = this.getTemplate(apiConfig.templateId);
    console.log('Using template:', template?.name || 'Default');

    // Create memory context
    const memory = this.createMemoryContext(character, template);

    // Format chat history using the template
    const formattedHistory = this.formatChatHistory(
      history, 
      character.data.name, 
      apiConfig.templateId
    );
    
    // Create the final prompt using the template
    const currentPrompt = this.formatPromptWithTemplate(
      formattedHistory,
      currentMessage,
      character.data.name,
      template
    );

    // Get stop sequences from template
    const stopSequences = this.getStopSequences(template, character.data.name);

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
        max_context_length: this.DEFAULT_PARAMS.max_context_length,
        max_length: this.DEFAULT_PARAMS.max_length
      }
    };
    
    // Log the context info for debugging
    console.log('Context info:', JSON.stringify(contextInfo, null, 2));

    // Generate unique key
    const genkey = `CKSH${Date.now().toString().slice(-4)}`;

    // Create payload
    const payload = {
      ...this.DEFAULT_PARAMS,
      memory,
      prompt: currentPrompt,
      genkey,
      stop_sequence: stopSequences
    };

    // Get API URL from config or use default
    const apiUrl = apiConfig?.url || 'http://localhost:5001';
    const endpoint = apiUrl.endsWith('/') ? 'api/extra/generate/stream' : '/api/extra/generate/stream';
    const fullUrl = apiUrl + endpoint;

    console.log('Making request to:', fullUrl);
    console.log('With payload:', payload);

    // Make the request
    return fetch(fullUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(payload),
      signal
    });
  }

  // Stream response handling with SSE
  static async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
    if (!response.body) throw new Error('No response body');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      console.log('Starting to read SSE stream');
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          console.log('Stream complete');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // Keep any incomplete line
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));  // Remove 'data: ' prefix
              console.log('SSE data:', data);
              
              if (data.token) {
                console.log('Yielding token:', data.token);
                yield data.token;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}