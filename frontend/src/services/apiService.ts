// services/apiService.ts
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
}

// Export a singleton instance
export const apiService = new ApiService();