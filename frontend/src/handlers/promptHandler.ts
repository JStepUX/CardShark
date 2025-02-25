import { CharacterCard } from '../types/schema';
import { APIConfig } from '../types/api';

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

  // Template definitions
  static readonly TEMPLATES: Record<string, any> = {
    // ChatML format (GPT-like)
    'openai': {
      type: 'chatml',
      system_start: "<|im_start|>system\n",
      system_end: "<|im_end|>\n",
      user_start: "<|im_start|>user\n",
      user_end: "<|im_end|>\n",
      assistant_start: "<|im_start|>assistant\n",
      assistant_end: "<|im_end|>\n"
    },
    
    // ChatML format (generic)
    'chatml': {
      type: 'chatml',
      system_start: "<|im_start|>system\n",
      system_end: "<|im_end|>\n",
      user_start: "<|im_start|>user\n",
      user_end: "<|im_end|>\n",
      assistant_start: "<|im_start|>assistant\n",
      assistant_end: "<|im_end|>\n"
    },
    
    // Mistral format
    'mistral': {
      type: 'mistral',
      system_start: "[INST] ",
      system_end: " [/INST]",
      user_start: "[INST] ",
      user_end: " [/INST]",
      assistant_start: "",
      assistant_end: "</s>"
    },
    
    // Llama format
    'llama2': {
      type: 'llama',
      system_start: "<|start_header_id|>system<|end_header_id|>\n\n",
      system_end: "<|eot_id|>\n\n",
      user_start: "<|start_header_id|>user<|end_header_id|>\n\n",
      user_end: "<|eot_id|>\n\n",
      assistant_start: "<|start_header_id|>assistant<|end_header_id|>\n\n",
      assistant_end: "<|eot_id|>\n\n"
    },
    
    // Claude format
    'claude': {
      type: 'claude',
      system_start: "\n\nSystem: ",
      system_end: "\n\n",
      user_start: "\n\nHuman: ",
      user_end: "\n\n",
      assistant_start: "Assistant: ",
      assistant_end: "\n\n"
    },
    
    // Gemini format
    'gemini': {
      type: 'gemini',
      user_start: "User: ",
      user_end: "\n",
      assistant_start: "Assistant: ",
      assistant_end: "\n"
    }
  };

  // Create memory context from character data
  private static createMemoryContext(character: CharacterCard): string {
    const { data } = character;
    return `${data.system_prompt}
Persona: ${data.description}
Personality: ${data.personality}
[Scenario: ${data.scenario}]
${data.mes_example}
***`;
  }

  // Get template format based on template name
  static getTemplateFormat(templateName: string): any {
    // Default to Mistral format if template is not specified
    if (!templateName) return this.TEMPLATES.mistral;
    
    const template = this.TEMPLATES[templateName.toLowerCase()];
    return template || this.TEMPLATES.mistral;
  }

  // Format prompt using the specified template
  static formatPromptWithTemplate(
    history: string,
    currentMessage: string,
    characterName: string,
    template: any
  ): string {
    // Different formatting based on template type
    switch (template.type) {
      case 'chatml':
        return `${history}\n<|im_start|>user\n${currentMessage}<|im_end|>\n<|im_start|>assistant\n${characterName}:`;
        
      case 'mistral':
        return `${history}\n[INST] ${currentMessage} [/INST]\n${characterName}:`;
        
      case 'llama':
        return `${history}\n<|start_header_id|>user<|end_header_id|>\n\n${currentMessage}<|eot_id|>\n\n<|start_header_id|>assistant<|end_header_id|>\n\n${characterName}:`;
        
      case 'claude':
        return `${history}\n\nHuman: ${currentMessage}\n\nAssistant: ${characterName}:`;
        
      default:
        // Default to Mistral format
        return `${history}\n[INST] ${currentMessage} [/INST]\n${characterName}:`;
    }
  }

  // Format chat history into proper template format
  static formatChatHistory(
    messages: Array<{ role: 'user' | 'assistant', content: string }>,
    characterName: string,
    template: any = this.TEMPLATES.mistral
  ): string {
    if (!messages || messages.length === 0) return '';
    
    return messages
      .map(msg => {
        const { role, content } = msg;
        
        // Format based on template type
        if (role === 'assistant') {
          return `${template.assistant_start}${characterName}: ${content}${template.assistant_end}`;
        } else {
          return `${template.user_start}${content}${template.user_end}`;
        }
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

    // Create memory context
    const memory = this.createMemoryContext(character);

    // Get the appropriate template format based on apiConfig.template
    const templateInfo = this.getTemplateFormat(apiConfig.template);
    
    // Format chat history using the template
    const formattedHistory = this.formatChatHistory(history, character.data.name, templateInfo);
    
    // Create the final prompt using the template
    const currentPrompt = this.formatPromptWithTemplate(
      formattedHistory,
      currentMessage,
      character.data.name,
      templateInfo
    );

    // Capture raw context information for debugging, now including template info
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
        name: apiConfig.template,
        format: templateInfo
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
      stop_sequence: [
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