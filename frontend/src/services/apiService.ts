// services/apiService.ts
import { APIConfig } from '@/types';
import { getApiBaseUrl } from '../utils/apiConfig';
import { CharacterData } from '../types/character';
import { LoreEntry } from '../types/schema'; // Added import for LoreEntry

interface LoreImageResponse {
  success: boolean;
  message?: string;
  data?: any;
}

/**
 * A service class for handling all API calls with proper development/production URL handling
 */
class ApiService {
  /**
   * Generates a room introduction using the LLM API
   * @param payload The payload for the room intro (context, npcs, prompt)
   * @param apiConfig The API configuration to use
   * @returns The LLM-generated room intro
   */
  async generateRoomIntro(payload: any, apiConfig: APIConfig) {
    return this.post('/api/generate-room-intro', {
      ...payload,
      apiConfig
    });
  }
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
   * Performs a PUT request to the specified endpoint with the given data
   */
  async put(endpoint: string, data: any) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
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
  async loadLatestChat(characterUuid: string) {
    // Fetch all sessions for the character
    const sessions = await this.get(`/api/chat_sessions/?character_uuid=${characterUuid}`);
    // Sort by last_modified timestamp in descending order and return the latest
    // Assuming 'sessions' is an array and each session has a 'last_modified' field.
    if (sessions && Array.isArray(sessions) && sessions.length > 0) {
      sessions.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());
      return sessions[0];
    }
    return null; // Or handle as appropriate if no sessions are found
  }

  /**
   * Saves the current chat state
   */
  async saveChat(sessionId: string, chatSessionData: any) { // Assuming chatSessionData contains messages, metadata etc.
    console.debug(`apiService.saveChat called for session ${sessionId}`);
    
    try {
      // Log the full payload for debugging
      console.debug('Saving chat session with data:', chatSessionData);
      
      const response = await this.put(`/api/chat_sessions/${sessionId}`, chatSessionData);
      
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
  async appendChatMessage(sessionId: string, message: any) {
    // 1. Load session
    const session = await this.loadChat(sessionId);
    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found.`);
    }

    // 2. Append message to log locally
    // Assuming session.log is the array of messages
    if (!session.log) session.log = [];
    session.log.push(message);
    
    // 3. PUT the entire updated session
    // The body of the PUT request should match the ChatSessionUpdate schema
    // This might mean just sending session.log or the entire session object
    // For now, let's assume the backend expects the full session object for update
    // and that the `saveChat` method is now `put /api/chat_sessions/{sessionId}`
    return this.saveChat(sessionId, session); // saveChat now handles the PUT
  }

  /**
   * Creates a new empty chat
   */
  async createNewChat(chatSessionCreateData: any) { // Assuming chatSessionCreateData matches ChatSessionCreate schema
    return this.post('/api/chat_sessions/', chatSessionCreateData);
  }

  /**
   * Loads a specific chat
   */
  async loadChat(sessionId: string) {
    return this.get(`/api/chat_sessions/${sessionId}`);
  }

  /**
   * Lists all available chats for a character
   */
/**
   * Deletes a specific chat session
   */
  async deleteChat(sessionId: string) {
    return this.delete(`/api/chat_sessions/${sessionId}`);
  }
  async listCharacterChats(characterUuid: string) {
    return this.get(`/api/chat_sessions/?character_uuid=${characterUuid}`);
  }
/**
   * Fetches available models from the Featherless API via the backend
   */
  async fetchFeatherlessModels(url: string, apiKey?: string) {
    console.log(`ApiService: Fetching Featherless models from URL: ${url}`);
    return this.post('/api/featherless/models', { url, apiKey });
  }

    // --- Lore Image Endpoints ---
  async uploadLoreImage(characterUuid: string, loreEntryId: string, imageFile: File, characterFallbackId?: string): Promise<LoreImageResponse> {
    const formData = new FormData();
    formData.append('character_uuid', characterUuid);
    formData.append('lore_entry_id', loreEntryId);
    formData.append('image_file', imageFile);
    if (characterFallbackId) {
      formData.append('character_fallback_id', characterFallbackId);
    }

    const response = await fetch(`${this.baseUrl}/api/lore/images/upload`, {
      method: 'POST',
      body: formData,
      // 'Content-Type' header is set automatically by browser for FormData
    });
    return this.handleResponse(response);
  }

  async importLoreImageFromUrl(characterUuid: string, loreEntryId: string, imageUrl: string, characterFallbackId?: string): Promise<LoreImageResponse> {
    const formData = new FormData();
    formData.append('character_uuid', characterUuid);
    formData.append('lore_entry_id', loreEntryId);
    formData.append('image_url', imageUrl);
    if (characterFallbackId) {
      formData.append('character_fallback_id', characterFallbackId);
    }

    const response = await fetch(`${this.baseUrl}/api/lore/images/from-url`, {
      method: 'POST',
      body: formData,
    });
    return this.handleResponse(response);
  }

  async deleteLoreImage(characterUuid: string, imageUuidOrFilename: string): Promise<LoreImageResponse> {
    const params = new URLSearchParams({
      character_uuid: characterUuid,
      image_uuid: imageUuidOrFilename,
    });
    return this.delete(`/api/lore/images/delete?${params.toString()}`);
  }

  // --- Lore Trigger Extraction ---
  async extractLoreTriggers(characterData: any, textContent: string): Promise<any> {
    // This matches the backend /api/lore/extract endpoint structure
    return this.post('/api/lore/extract', {
      character_data: characterData,
      text: textContent,
    });
  }

  // --- Lore Entry Management ---
  async saveLoreEntries(characterUuid: string, loreEntries: LoreEntry[]): Promise<any> {
    return this.post(`/api/lore/character/${characterUuid}/batch`, {
      lore_entries: loreEntries,
    });
  }
}

// Export a singleton instance
export const apiService = new ApiService();



/**
 * List all available chats for a character
 */
export const listCharacterChats = async (characterData: CharacterData): Promise<any> => {
  try {
    const response = await fetch('/api/reliable-list-chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        character_data: characterData,
        scan_all_files: true
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