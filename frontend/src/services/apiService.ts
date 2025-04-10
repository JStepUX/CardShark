// services/apiService.ts
import { APIConfig } from '@/types';
import { getApiBaseUrl } from '../utils/apiConfig';

/**
 * A service class for handling all API calls with proper development/production URL handling
 */
class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getApiBaseUrl();
  }

  /**
   * Performs a GET request to the specified endpoint
   */
  async get(endpoint: string) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      return await this.handleResponse(response);
    } catch (error) {
      this.handleError(error, endpoint);
      throw error;
    }
  }

  /**
   * Performs a POST request to the specified endpoint with the given data
   */
  async post(endpoint: string, data: any) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        // Remove experimental options for now
        cache: 'no-store'
        // priority: 'high',
        // keepalive: true
      });
      return await this.handleResponse(response);
    } catch (error) {
      this.handleError(error, endpoint);
      throw error;
    }
  }

  /**
   * Performs a DELETE request to the specified endpoint
   */
  async delete(endpoint: string) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE'
      });
      return await this.handleResponse(response);
    } catch (error) {
      this.handleError(error, endpoint);
      throw error;
    }
  }

  /**
   * Handles the API response, parsing JSON if possible
   */
  private async handleResponse(response: Response) {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  }

  /**
   * Handles and logs API errors
   */
  private handleError(error: any, endpoint: string) {
    console.error(`API call to ${endpoint} failed:`, error);
  }

  // Context Window Specific Methods
  
  /**
   * Loads the context window
   */
  async loadContextWindow() {
    return this.get('/api/context-window');
  }

  /**
   * Saves the context window
   */
  async saveContextWindow(context: any) {
    return this.post('/api/context-window', { context });
  }

  /**
   * Clears the context window
   */
  async clearContextWindow() {
    return this.delete('/api/context-window');
  }

  /**
   * Loads the latest chat for a character
   */
  async loadLatestChat(characterData: any) {
    return this.post('/api/load-latest-chat', { character_data: characterData });
  }

  /**
   * Saves the current chat state
   */
  async saveChat(characterData: any, messages: any[], lastUser?: any, apiInfo?: any) {
    console.debug(`apiService.saveChat called with ${messages.length} messages`);
    
    try {
      const response = await this.post('/api/save-chat', {
        character_data: characterData,
        messages,
        lastUser,
        api_info: apiInfo
      });
      
      console.debug('API response from save-chat:', response);
      return response;
    } catch (error) {
      console.error('API error in saveChat:', error);
      throw error;
    }
  }

  /**
   * Appends a message to the current chat
   */
  async appendChatMessage(characterData: any, message: any) {
    return this.post('/api/append-chat-message', {
      character_data: characterData,
      message
    });
  }

  /**
   * Creates a new empty chat
   */
  async createNewChat(characterData: any) {
    return this.post('/api/create-new-chat', { character_data: characterData });
  }

  /**
   * Loads a specific chat
   */
  async loadChat(characterData: any, chatId: string) {
    return this.post('/api/load-chat', {
      character_data: characterData,
      chat_id: chatId
    });
  }

  /**
   * Lists all available chats for a character
   */
  async listCharacterChats(characterData: any) {
    return this.post('/api/list-character-chats', { character_data: characterData });
  }
}

// Export a singleton instance
export const apiService = new ApiService();

/**
 * Create a new chat for a character
 */
export const createNewChat = async (characterData: CharacterData): Promise<any> => {
  try {
    const response = await fetch('/api/create-new-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        character_data: characterData
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create new chat: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating new chat:', error);
    throw error;
  }
}

/**
 * List all available chats for a character
 */
export const listCharacterChats = async (characterData: CharacterData): Promise<any> => {
  try {
    const response = await fetch('/api/list-character-chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        character_data: characterData
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to list character chats: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing character chats:', error);
    throw error;
  }
}

/**
 * Generate a response using the dynatemp settings
 */
export const generateResponse = async (prompt: string, config: APIConfig) => {
  // Build the request payload
  const payload = {
    prompt,
    ...(config.generation_settings?.dynatemp_enabled && {
      dynatemp_config: {
        dynatemp_range: [
          config.generation_settings.dynatemp_min, 
          config.generation_settings.dynatemp_max
        ],
        dynatemp_exponent: config.generation_settings.dynatemp_exponent
      }
    }),
  };

  try {
    const response = await fetch('/api/generate-response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate response: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
};