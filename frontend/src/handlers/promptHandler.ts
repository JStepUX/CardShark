// promptHandler.ts
import { CharacterCard } from '../types/schema';

interface StreamingResponse {
  content?: string;
  error?: string;
}

export class PromptHandler {
  // Create character prompt context
  static createCharacterContext(character: CharacterCard): string {
    const { data } = character;
    return `Name: "${data.name}"
Description: ${data.description}
Personality: ${data.personality}
Scenario: ${data.scenario}
System Prompt: ${data.system_prompt}
Example Messages: ${data.mes_example}
First Message: ${data.first_mes}`;
  }

  // Handle streaming generation
  static async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
    if (!response.body) throw new Error('No response body');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamingResponse;
              if (data.error) throw new Error(data.error);
              if (data.content) yield data.content;
            } catch (e) {
              if (line.includes('[DONE]')) continue;
              console.error('Error parsing SSE message:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Generate first message variation
  static async generateFirstMessage(character: CharacterCard): Promise<Response> {
    return fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `You are tasked with crafting a new, engaging first message for a character using the information provided below. Your new message should be natural, distinctly in-character, and should not replicate the scenario of the current first message, while still matching its style, formatting, and relative length as a quality benchmark.
${this.createCharacterContext(character)}
Craft a new introductory message that starts the conversation in a fresh and engaging way, ensuring variety from the existing scenario.`
      })
    });
  }

  // Generate chat response
  static async generateChatResponse(
    character: CharacterCard, 
    message: string,
    history: { role: 'user' | 'assistant', content: string }[] = []
  ): Promise<Response> {
    return fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `The following describes a character you will roleplay as:
${this.createCharacterContext(character)}
Engage in conversation while staying true to the character's personality and background. Previous messages:
${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}
user: ${message}`
      })
    });
  }
}