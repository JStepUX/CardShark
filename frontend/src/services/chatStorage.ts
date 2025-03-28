// chatStorage.ts
import { CharacterData } from '../contexts/CharacterContext';
import { apiService } from './apiService'; // Assuming apiService handles direct fetch or has methods
import { Message, UserProfile } from '../types/messages';
import { getCharacterId } from '../utils/characterLoader';
import { APIConfig } from '../types/api'; // Import APIConfig type

export class ChatStorage {
  // Load the latest chat for a character
  static async loadLatestChat(characterData: CharacterData) {
    return apiService.loadLatestChat(characterData);
  }

  // Load a specific chat by ID
  static async loadChat(characterData: CharacterData, chatId: string) {
    return apiService.loadChat(characterData, chatId);
  }

  // Create a new chat
  static async createNewChat(characterData: CharacterData) {
    return apiService.createNewChat(characterData);
  }

  // Save full chat state
  static async saveChat(characterData: CharacterData, messages: Message[], lastUser?: UserProfile | null, apiInfo?: any) { // Updated lastUser type hint
    console.debug(`ChatStorage.saveChat called with ${messages.length} messages`);
    console.debug('Character name:', characterData?.data?.name);

    try {
      // Ensure lastUser is either an object or null, not 'any' if possible
      const result = await apiService.saveChat(characterData, messages, lastUser, apiInfo);
      console.debug('apiService.saveChat result:', result);
      return result;
    } catch (err) {
      console.error('Error in ChatStorage.saveChat:', err);
      throw err;
    }
  }

  // Append/update a single message
  static async appendMessage(characterData: CharacterData, message: Message) {
    return apiService.appendChatMessage(characterData, message);
  }

  // Load context window
  static async loadContextWindow() {
    return apiService.loadContextWindow();
  }

  // Save context window
  static async saveContextWindow(context: any) {
    return apiService.saveContextWindow(context);
  }

  // Clear context window
  static async clearContextWindow() {
    return apiService.clearContextWindow();
  }

  // --- NEW: Generate Greeting Method ---
  static async generateGreeting(
    characterData: CharacterData,
    apiConfig: APIConfig
  ): Promise<{ success: boolean; greeting?: string; message?: string }> {
    console.log("ChatStorage.generateGreeting called");
    try {
      // Extract character info needed for the prompt
      const charName = characterData.data?.name || 'Character';
      const description = characterData.data?.description || '';
      const personality = characterData.data?.personality || '';
      const scenario = characterData.data?.scenario || '';
      const firstMessage = characterData.data?.first_mes || '';
      const examples = characterData.data?.mes_example || '';
      
      // Create specialized prompt for greeting generation
      const promptText = `You are tasked with crafting a new, engaging first message for ${charName} using the information provided below. Your new message should be natural, distinctly in-character, and should not replicate the scenario of the current first message, while still matching its style, formatting, and relative length as a quality benchmark.
  
  Description: ${description}
  Personality: ${personality}
  Scenario: ${scenario}
  
  Use the following as reference points:
  Current First Message: ${firstMessage}
  Example Messages: 
  ${examples}
  
  Craft a new introductory message that starts the conversation in a fresh and engaging way, ensuring variety from the existing scenario.`;
      
      // Prepare generation parameters 
      const genParams = {
        memory: `${description}\n${personality}\n${scenario}`,
        prompt: promptText,
        stop_sequence: [`User:`, `Human:`, `${charName}:`],
        character_data: characterData,
        chat_history: [], // Empty for a fresh generation
        current_message: "Generate alternate greeting"
      };
      
      // Use the existing API endpoint
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_config: apiConfig,
          generation_params: genParams
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API Error: ${response.status}`);
      }
      
      // Process the streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }
      
      let greeting = '';
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const decodedChunk = decoder.decode(value, { stream: true });
        const lines = decodedChunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                greeting += parsed.token;
              } else if (parsed.content) {
                greeting += parsed.content;
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        }
      }
      
      // Clean up the greeting
      greeting = greeting.trim();
      
      // Remove character name prefix if present
      const namePattern = new RegExp(`^${charName}\\s*:`, 'i');
      greeting = greeting.replace(namePattern, '').trim();
      
      return {
        success: true,
        greeting
      };
    } catch (error) {
      console.error('Error in ChatStorage.generateGreeting:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during greeting generation'
      };
    }
  }
  // --- END: Generate Greeting Method ---


  // Get user from local storage
  static getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem('cardshark_current_user');
      if (stored) {
        const userData = JSON.parse(stored);
        // Basic validation
        if (userData && typeof userData.name === 'string') {
           // Ensure essential fields exist, provide defaults or generate if needed
           const userProfile: UserProfile = {
              id: userData.id || `user_${userData.name.replace(/\s+/g, '_')}_${Date.now()}`,
              name: userData.name,
              filename: userData.filename || `${userData.name.replace(/\s+/g, '_')}.png`, // Example default
              size: userData.size || 0,
              modified: userData.modified || Date.now(),
              avatar: userData.avatar, // Optional
              color: userData.color    // Optional
           };
           return userProfile;
        }
      }
      return null;
    } catch (err) {
      console.error('Error loading stored user:', err);
      return null;
    }
  }

  // Save user to local storage
  static saveCurrentUser(user: UserProfile | null) {
    try {
        if (user) {
          // Ensure the user object has an ID before saving
          const userToSave = {
            ...user,
            id: user.id || `user_${user.name.replace(/\s+/g, '_')}_${Date.now()}`, // Generate ID if missing
          };
          localStorage.setItem('cardshark_current_user', JSON.stringify(userToSave));
        } else {
          localStorage.removeItem('cardshark_current_user');
        }
    } catch(err) {
        console.error("Error saving current user to localStorage:", err);
    }
  }

  // Get character ID from character data
  static getCharacterId(character: CharacterData | null): string | null {
    // Ensure the imported function is used correctly
    return getCharacterId(character);
  }
}