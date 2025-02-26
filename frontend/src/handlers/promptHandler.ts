// src/handlers/promptHandler.ts

import { CharacterCard } from '../types/schema';
import { APIConfig } from '../types/api';
import { Template } from '../types/templateTypes';
import { templateService } from '../services/templateService';

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

  // Get template by ID or name or default to Mistral
  static getTemplate(templateId: string | undefined): Template {
    if (!templateId) {
      // Default to Mistral if no template specified
      return templateService.getTemplateById('mistral') || 
             templateService.getTemplateByName('Mistral') || 
             this.getFallbackTemplate();
    }
    
    // Try to find by ID first
    const template = templateService.getTemplateById(templateId);
    if (template) return template;
    
    // Then try by name
    const templateByName = templateService.getTemplateByName(templateId);
    if (templateByName) return templateByName;
    
    // Fallback to default if not found
    console.warn(`Template '${templateId}' not found, using default`);
    return this.getFallbackTemplate();
  }
  
  // Fallback template in case of missing templates
  private static getFallbackTemplate(): Template {
    return {
      id: 'mistral-fallback',
      name: 'Mistral Fallback',
      description: 'Default fallback template',
      isBuiltIn: true,
      isEditable: false,
      systemFormat: '[INST] {{content}} [/INST]',
      userFormat: '[INST] {{content}} [/INST]',
      assistantFormat: '{{char}}: {{content}}',
      memoryFormat: '{{#if system}}[INST] {{system}} [/INST]\n{{/if}}Persona: {{description}}\nPersonality: {{personality}}\n[Scenario: {{scenario}}]',
      stopSequences: ['[INST]', 'User:', 'Assistant:', '{{char}}:'],
    };
  }

  // Create memory context from character data using the template
  private static createMemoryContext(character: CharacterCard, template: Template): string {
    const { data } = character;
    
    if (!template.memoryFormat) {
      // Default memory format if not specified
      return `${data.system_prompt}
Persona: ${data.description}
Personality: ${data.personality}
[Scenario: ${data.scenario}]
${data.mes_example || ''}
***`;
    }
    
    // Process template with character data
    let memoryText = template.memoryFormat;
    
    // Process conditional blocks - very simple implementation
    if (memoryText.includes('{{#if')) {
      // Handle system prompt conditional
      if (data.system_prompt) {
        memoryText = memoryText.replace(/{{#if system}}(.*?){{\/if}}/gs, '$1');
      } else {
        memoryText = memoryText.replace(/{{#if system}}.*?{{\/if}}/gs, '');
      }
    }
    
    // Replace variables
    return memoryText
      .replace(/{{system}}/g, data.system_prompt || '')
      .replace(/{{description}}/g, data.description || '')
      .replace(/{{personality}}/g, data.personality || '')
      .replace(/{{scenario}}/g, data.scenario || '')
      .replace(/{{example}}/g, data.mes_example || '');
  }

  // Format message with template
  private static formatMessage(role: 'system' | 'user' | 'assistant', content: string, characterName: string, template: Template): string {
    let format = '';
    
    switch (role) {
      case 'system':
        format = template.systemFormat || '';
        break;
      case 'user':
        format = template.userFormat;
        break;
      case 'assistant':
        format = template.assistantFormat;
        break;
    }
    
    return format
      .replace(/{{content}}/g, content)
      .replace(/{{char}}/g, characterName);
  }

  // Format chat history into proper template format
  static formatChatHistory(
    messages: Array<{ role: 'user' | 'assistant', content: string }>,
    characterName: string,
    template: Template
  ): string {
    if (!messages || messages.length === 0) return '';
    
    return messages
      .map(msg => {
        return this.formatMessage(
          msg.role, 
          msg.content, 
          characterName, 
          template
        );
      })
      .join('\n');
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

    // Get the template based on API config
    const template = this.getTemplate(apiConfig.template);
    console.log('Using template:', template.name);

    // Create memory context
    const memory = this.createMemoryContext(character, template);

    // Format chat history
    const formattedHistory = this.formatChatHistory(
      history, 
      character.data.name, 
      template
    );
    
    // Format current message
    const userMessage = this.formatMessage(
      'user', 
      currentMessage, 
      character.data.name, 
      template
    );
    
    // Combine into final prompt
    const currentPrompt = `${formattedHistory}\n${userMessage}`;
    
    // Add a starting token for the assistant's response if needed
    const assistantStartToken = template.assistantFormat.split('{{content}}')[0]
                                  .replace(/{{char}}/g, character.data.name);
    
    const finalPrompt = `${currentPrompt}${assistantStartToken}`;

    // Capture context information for debugging
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
      formattedPrompt: finalPrompt,
      template: {
        name: template.name,
        id: template.id
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
      prompt: finalPrompt,
      genkey,
      stop_sequence: template.stopSequences || [
        "<|im_end|>\\n<|im_start|>user",
        "<|im_end|>\\n<|im_start|>assistant",
        "User:",
        "Assistant:",
        `${character.data.name}:`
      ]
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