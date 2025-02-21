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

  // Format chat history into proper template format
  private static formatChatHistory(
    messages: Array<{ role: 'user' | 'assistant', content: string }>,
    characterName: string
  ): string {
    return messages
      .map(msg => {
        if (msg.role === 'assistant') {
          return `<|im_start|>assistant\n${characterName}: ${msg.content}<|im_end|>`;
        } else {
          return `<|im_start|>user\n${msg.content}<|im_end|>`;
        }
      })
      .join('\n');
  }

  // Generate chat response
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

    // Format chat history and current message
    const formattedHistory = this.formatChatHistory(history, character.data.name);
    const currentPrompt = `${formattedHistory}\n<|im_start|>user\n${currentMessage}<|im_end|>\n<|im_start|>assistant\n${character.data.name}:`;

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