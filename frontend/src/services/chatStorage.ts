import { CharacterCard } from '../types/schema';
import { Message, UserProfile } from '../types/messages';
import { promptService } from './promptService';

export class ChatStorage {
  /**
   * Generates a greeting for a character using the configured API
   * @param characterData The character data to generate a greeting for
   * @param apiConfig The API configuration to use for generation
   * @returns A promise that resolves to the generated greeting
   */
  static async generateGreeting(characterData: any, apiConfig: any): Promise<{ success: boolean; greeting?: string; message?: string }> {
    try {
      // Use the dedicated greeting generation endpoint
      const response = await fetch("/api/generate-greeting", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          character_data: characterData,
          api_config: apiConfig,
          prompt_template: promptService.getPrompt('generateIntro')
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API responded with status ${response.status}`);
      }

      // For this endpoint, we expect a direct JSON response rather than a stream
      const data = await response.json();

      if (!data.success || !data.greeting) {
        throw new Error(data.message || "Failed to generate greeting");
      }

      return {
        success: true,
        greeting: data.greeting
      };
    } catch (error) {
      console.error('Error generating greeting:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generates a greeting for a character using the configured API (STREAMING VERSION)
   * @param characterData The character data to generate a greeting for
   * @param apiConfig The API configuration to use for generation
   * @param onChunk Optional callback for streaming updates
   * @returns A promise that resolves to the generated greeting
   */
  static async generateGreetingStream(
    characterData: any,
    apiConfig: any,
    onChunk?: (chunk: string) => void
  ): Promise<{ success: boolean; greeting?: string; message?: string }> {
    try {
      // Use the dedicated greeting generation endpoint
      const response = await fetch("/api/generate-greeting", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          character_data: characterData,
          api_config: apiConfig,
          prompt_template: promptService.getPrompt('generateIntro')
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
        throw new Error(errorData.message || `API responded with status ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is not readable");

      const decoder = new TextDecoder();
      let fullGreeting = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);

              if (data.error) {
                throw new Error(data.error.message || "Streaming error");
              }

              if (data.content) {
                fullGreeting += data.content;
                if (onChunk) {
                  onChunk(data.content);
                }
              }
            } catch (e) {
              // Ignore JSON parse errors for non-JSON lines or partial data
              console.warn("Error parsing SSE data:", e);
            }
          }
        }
      }

      return {
        success: true,
        greeting: fullGreeting
      };
    } catch (error) {
      console.error('Error generating greeting:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Extracts a character ID from various possible locations in a character object
   */
  static getCharacterId(character: CharacterCard): string {
    // 1. Prioritize the new character_uuid from the nested data object
    if (character.data?.character_uuid && typeof character.data.character_uuid === 'string' && character.data.character_uuid.trim() !== '') {
      return character.data.character_uuid;
    }

    // 2. Fallback to the older character_id if it exists (less specific location)
    // This was the previous primary check.
    if ((character as any).character_id && typeof (character as any).character_id === 'string' && (character as any).character_id.trim() !== '') {
      return (character as any).character_id;
    }

    // 3. Fallback to constructing an ID from the character name
    if (character.data?.name && typeof character.data.name === 'string' && character.data.name.trim() !== '') {
      // Use 8 characters of a hash as a simple unique identifier
      const hash = this.simpleHash(character.data.name);
      return `${character.data.name}-${hash}`;
    }

    // 4. Final fallback if no usable identifier can be found
    console.warn('Could not determine a valid character ID for:', character);
    return 'unknown-character';
  }

  // Add a simple hashing function
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to string and take last 8 characters
    return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
  }

  /**
   * Lists all chats for a character
   */
  static async listChats(character: CharacterCard | null): Promise<any[]> {
    if (!character) {
      console.error('Cannot list chats: No character provided');
      return [];
    }

    try {
      console.log('Listing chats for character:', character.data?.name);

      // Extract character ID
      const characterId = this.getCharacterId(character);
      console.log('Using character ID:', characterId);

      // Added scanAllFiles parameter to ensure we scan for all JSONL files 
      // regardless of naming convention
      const response = await fetch(`/api/reliable-list-chats/${characterId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to list chats:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      console.log('Chat list received:', data);
      return data.data || [];
    } catch (error) {
      console.error('Error listing chats:', error);
      return [];
    }
  }

  /**
   * Loads a specific chat by ID
   * If chatId is null or undefined, it will load the active chat for the character
   */
  static async loadChat(chatId: string | null, character: CharacterCard | null): Promise<any> {
    if (!character) {
      console.error('Cannot load chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      console.log(`Loading chat${chatId ? ` with ID: ${chatId}` : ' (using active chat)'} for character: ${character.data?.name}`);

      // Extract character ID
      const characterId = this.getCharacterId(character);
      console.log('Using character ID:', characterId);

      const response = await fetch('/api/reliable-load-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_uuid: this.getCharacterId(character),
          chat_session_uuid: chatId // Use chat_session_uuid instead of chat_id
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to load chat:', response.status, errorText);
        return { success: false, error: `Failed to load chat: ${response.status}` };
      }

      const data = await response.json();
      console.log('Chat loaded successfully:', data);
      return data;
    } catch (error) {
      console.error('Error loading chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Creates a new chat for a character
   */
  static async createNewChat(character: CharacterCard | null): Promise<any> {
    if (!character) {
      console.error('Cannot create chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      console.log('Creating new chat for character:', character.data?.name);

      // Extract character ID
      // Extract character ID
      const characterUuid = this.getCharacterId(character);
      if (!characterUuid || characterUuid === 'unknown-character') {
        console.error('Cannot create chat: Unable to determine character ID');
        return { success: false, error: 'Missing character ID' };
      }
      console.log('Using character_uuid:', characterUuid);

      const payload: { character_uuid: string; user_uuid?: string; title?: string } = {
        character_uuid: characterUuid
      };
      // Optional fields can be added here if available, e.g.:
      // if (currentUser?.uuid) payload.user_uuid = currentUser.uuid;
      // if (character.data?.name) payload.title = `Chat with ${character.data.name}`;


      const response = await fetch('/api/reliable-create-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to create new chat:', response.status, errorData.detail || errorData.message);
        return { success: false, error: `Failed to create chat: ${response.status} - ${errorData.detail || errorData.message || 'Unknown error'}` };
      }

      const data = await response.json();
      console.log('New chat created:', data);

      // The API returns the chat session data wrapped in a DataResponse structure
      if (data.data && data.data.chat_session_uuid) {
        // Extract the needed fields from data.data, excluding any conflicting fields like 'success'
        const { success: _, messages: __, ...cleanData } = data.data;
        const result = { success: true, ...cleanData };
        return result;
      } else {
        console.error('/api/reliable-create-chat response missing chat_session_uuid:', data);
        return { success: false, error: 'Missing chat_session_uuid in response' };
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Saves a chat session
   */
  static async saveChat(
    _character: CharacterCard, // Keep for potential title generation or other metadata
    chatSessionUuid: string,
    messages: Message[],
    _currentUser: UserProfile | null, // Keep for potential future use or logging
    _apiInfo: any = null, // Keep for potential future use or logging
    _backgroundSettings: any = null,
    _lorePersistenceData?: {
      triggeredLoreImages: any[];
      currentDisplayedImage?: { type: 'character' | 'lore'; entryId?: string; imageUuid?: string };
    },
    title?: string // Optional title for the chat session
  ): Promise<any> {
    if (!chatSessionUuid) {
      console.error('Cannot save chat: No chat_session_uuid provided');
      return { success: false, error: 'No chat_session_uuid provided' };
    }
    // Runtime check to ensure chatSessionUuid is a string, as per payload requirements
    if (typeof chatSessionUuid !== 'string') {
      console.error(`SAVE CHAT ERROR: chat_session_uuid must be a string, but received type ${typeof chatSessionUuid}. Value:`, chatSessionUuid);
      return { success: false, error: 'Invalid payload: chat_session_uuid is not a string.' };
    }

    if (!messages) {
      console.error('Cannot save chat: No messages provided');
      return { success: false, error: 'No messages provided' };
    }
    // Runtime check to ensure messages is an array, as per payload requirements
    if (!Array.isArray(messages)) {
      console.error(`SAVE CHAT ERROR: messages must be an array, but received type ${typeof messages}. Value:`, messages);
      return { success: false, error: 'Invalid payload: messages is not an array.' };
    }

    try {
      console.log(`Saving chat for session ID: ${chatSessionUuid} with ${messages.length} messages.`);

      const payload: {
        chat_session_uuid: string;
        messages: Message[];
        title?: string;
      } = {
        chat_session_uuid: chatSessionUuid,
        messages: messages,
      };

      if (title) {
        payload.title = title;
      }
      // The "Backend API Payload Guide" for /api/save-chat only specifies:
      // {"chat_session_uuid": "string", "messages": [MessageObject, ...], "title": "optional_string"}
      // Other parameters like character, currentUser, apiInfo, backgroundSettings, lorePersistenceData
      // are passed to this saveChat function but are not part of the /api/save-chat payload itself.
      // They might be used for logging or other client-side logic if needed, or for generating the title.

      const response = await fetch('/api/reliable-save-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to save chat:', response.status, errorText);
        return { success: false, error: `Failed to save chat: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error saving chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Loads the latest chat for a character
   */
  static async loadLatestChat(character: CharacterCard): Promise<any> {
    if (!character) {
      console.error('Cannot load latest chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      console.log('Loading latest chat for character:', character.data?.name);

      const characterUuid = this.getCharacterId(character);
      if (!characterUuid || characterUuid === 'unknown-character') {
        console.error('Cannot load latest chat: Unable to determine character ID');
        return { success: false, error: 'Missing character ID', isRecoverable: true, first_mes_available: character?.data?.first_mes ? true : false };
      }
      console.log('Using character_uuid for load-latest-chat:', characterUuid);

      const response = await fetch('/api/reliable-load-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_uuid: characterUuid
        }),
      });

      // More detailed logging for debugging response issues
      console.log(`Latest chat response status: ${response.status}`);

      if (response.status === 404) {
        console.log('Received 404 from /api/reliable-load-chat, treating as "no chats found"');
        return {
          success: false,
          error: "No chats found",
          isRecoverable: true,
          // Add first_mes status information to improve error handling
          first_mes_available: character?.data?.first_mes ? true : false
        };
      }

      if (!response.ok) {
        let errorText = '';
        try {
          // Try to parse a JSON error response body
          const errorJson = await response.json();
          errorText = errorJson.error || errorJson.message || `HTTP ${response.status}`;
        } catch (e) {
          // If JSON parsing fails, get the error as plain text
          errorText = await response.text() || `HTTP ${response.status}`;
        }
        console.error('Failed to load latest chat:', response.status, errorText);
        return {
          success: false,
          error: `Failed to load latest chat: ${errorText}`,
          // isRecoverable could be true for other server errors too, but 404 is definite.
          isRecoverable: false
        };
      }

      let data;
      // Handle potential malformed JSON responses
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        return {
          success: false,
          error: `Failed to parse response: ${jsonError instanceof Error ? jsonError.message : 'Invalid JSON'}`,
          isRecoverable: true, // Likely recoverable by creating a new chat
          // Add first_mes status information to improve error handling
          first_mes_available: character?.data?.first_mes ? true : false
        };
      }

      // Handle if response.json() successfully parses to null (valid backend response for no chat)
      if (data === null) {
        console.log('/api/load-latest-chat returned null, treating as "no chat session found"');
        return {
          success: false, // Change to false so it triggers recovery logic
          data: null,
          chat_session_uuid: null,
          messages: [],
          title: null,
          chat_id: null,
          error: "No chats found",
          isRecoverable: true,
          first_mes_available: character?.data?.first_mes ? true : false
        };
      }

      // Handle empty success responses from Featherless
      // This check should now be safe as 'data' is confirmed not to be null.
      if (data.success === true && (!data.messages || (Array.isArray(data.messages) && data.messages.length === 0))) {
        console.log('API returned success but no messages, treating as "no chats found"');
        return {
          success: false,
          error: "No chats found (API returned empty success response)",
          isRecoverable: true,
          // Add first_mes status information to improve error handling
          first_mes_available: character?.data?.first_mes ? true : false
        };
      }

      // Log message details for debugging
      if (data.success && data.messages) {
        console.log(`Successfully loaded chat with ${data.messages.length} messages`);

        // Log a summary of the messages
        if (data.messages.length > 0) {
          console.debug('First message:', {
            role: data.messages[0].role,
            content: data.messages[0].content?.substring(0, 50) + '...',
            id: data.messages[0].id
          });

          if (data.messages.length > 1) {
            console.debug('Last message:', {
              role: data.messages[data.messages.length - 1].role,
              content: data.messages[data.messages.length - 1].content?.substring(0, 50) + '...',
              id: data.messages[data.messages.length - 1].id
            });
          }
        } else {
          console.warn('Loaded chat contains no messages');
        }
      } else {
        console.warn('Chat loading response format:', data);
      }

      // Check if we have a chat_session_uuid and handle response appropriately
      if (data.data && data.data.chat_session_uuid) {
        // If we have messages from the updated endpoint, return success
        if (data.success && data.data.messages && Array.isArray(data.data.messages) && data.data.messages.length > 0) {
          return { success: true, ...data.data };
        } else {
          // If we only have session metadata (no messages or empty messages array),
          // treat as recoverable so first_mes can be used to initialize the chat
          console.log('Chat session exists but has no messages, treating as recoverable for first_mes initialization');
          return {
            success: false,
            error: "Chat session exists but has no messages",
            isRecoverable: true,
            first_mes_available: character?.data?.first_mes ? true : false,
            chat_session_uuid: data.data.chat_session_uuid
          };
        }
      } else {
        console.warn('/api/load-latest-chat response missing chat_session_uuid');
        // Treat as recoverable if first_mes is available, as a new chat can be started
        return {
          success: false,
          error: "Missing chat_session_uuid in response",
          isRecoverable: character?.data?.first_mes ? true : false,
          first_mes_available: character?.data?.first_mes ? true : false
        };
      }
      return data; // Return full data which might include error messages
    } catch (error) {
      console.error('Error loading latest chat:', error);
      return {
        success: false,
        error: `Error: ${error instanceof Error ? error.message : String(error)}`,
        isRecoverable: true // Most network/parsing errors should be recoverable
      };
    }
  }

  /**
   * Appends a message to the current chat
   */
  static async appendMessage(chatSessionUuid: string, message: Message): Promise<any> {
    if (!chatSessionUuid) {
      console.error('Cannot append message: No chat_session_uuid provided');
      return { success: false, error: 'No chat_session_uuid provided' };
    }
    if (!message) {
      console.error('Cannot append message: No message provided');
      return { success: false, error: 'No message provided' };
    }

    try {
      console.log(`Appending message to chat session ID: ${chatSessionUuid}`);

      const payload = {
        chat_session_uuid: chatSessionUuid,
        message: message
      };

      const response = await fetch('/api/reliable-append-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to append message:', response.status, errorText);
        return { success: false, error: `Failed to append message: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error appending message:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Deletes a specific chat by ID
   */
  static async deleteChat(character: CharacterCard, chatId: string): Promise<any> {
    if (!character) {
      console.error('Cannot delete chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot delete chat: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log('Deleting chat with ID:', chatId, 'for character:', character.data?.name);

      const response = await fetch(`/api/reliable-delete-chat/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to delete chat:', response.status, errorText);
        return { success: false, error: `Failed to delete chat: ${response.status} ${errorText}` };
      }

      const data = await response.json();
      console.log('Chat deleted successfully:', data);
      return data;
    } catch (error) {
      console.error('Error deleting chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Loads the context window from storage
   */
  static async loadContextWindow(): Promise<any> {
    try {
      const storedContext = localStorage.getItem('cardshark_context_window');
      if (storedContext) {
        return { success: true, context: JSON.parse(storedContext) };
      }
      return { success: true, context: null };
    } catch (error) {
      console.error('Error loading context window:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Saves the context window to storage
   */
  static async saveContextWindow(context: any): Promise<any> {
    try {
      localStorage.setItem('cardshark_context_window', JSON.stringify(context));
      return { success: true };
    } catch (error) {
      console.error('Error saving context window:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Clears the context window from storage
   */
  static async clearContextWindow(): Promise<any> {
    try {
      localStorage.removeItem('cardshark_context_window');
      return { success: true };
    } catch (error) {
      console.error('Error clearing context window:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Gets the current user from localStorage
   */
  static getCurrentUser(): UserProfile | null {
    try {
      const storedUser = localStorage.getItem('cardshark_current_user');
      if (storedUser) {
        return JSON.parse(storedUser);
      }
      return null;
    } catch (err) {
      console.error('Error loading current user:', err);
      return null;
    }
  }

  /**
   * Saves the current user to localStorage
   */
  static saveCurrentUser(user: UserProfile | null): void {
    try {
      if (user) {
        localStorage.setItem('cardshark_current_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('cardshark_current_user');
      }
    } catch (err) {
      console.error('Error saving current user:', err);
    }
  }

  /**
   * Validates a chat file for structure and content integrity
   * @param character The character associated with the chat
   * @param chatId The ID of the chat to validate
   * @param attemptRepair Whether to attempt automatic repair
   * @returns Validation results including any issues found
   */
  static async validateChat(character: CharacterCard, chatId: string, attemptRepair: boolean = false): Promise<any> {
    if (!character) {
      console.error('Cannot validate chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot validate chat: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log(`Validating chat ${chatId} for character:`, character.data?.name);

      const response = await fetch('/api/validate-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character,
          chat_id: chatId,
          attempt_repair: attemptRepair
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to validate chat:', response.status, errorText);
        return { success: false, error: `Failed to validate chat: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error validating chat:', error);
      return {
        success: false,
        error: `Error: ${error}`,
        issues: [`Exception occurred: ${error}`]
      };
    }
  }

  /**
   * Repairs a corrupted chat file
   * @param character The character associated with the chat
   * @param chatId The ID of the chat to repair
   * @returns Result of the repair operation
   */
  static async repairChat(character: CharacterCard, chatId: string): Promise<any> {
    if (!character) {
      console.error('Cannot repair chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot repair chat: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log(`Repairing chat ${chatId} for character:`, character.data?.name);

      const response = await fetch('/api/repair-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character,
          chat_id: chatId
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to repair chat:', response.status, errorText);
        return { success: false, error: `Failed to repair chat: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error repairing chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Lists available backups for a chat
   * @param character The character associated with the chat
   * @param chatId The ID of the chat to list backups for
   * @returns List of available backups
   */
  static async listChatBackups(character: CharacterCard, chatId: string): Promise<any> {
    if (!character) {
      console.error('Cannot list backups: No character provided');
      return { success: false, error: 'No character selected', backups: [] };
    }

    if (!chatId) {
      console.error('Cannot list backups: No chat ID provided');
      return { success: false, error: 'No chat ID provided', backups: [] };
    }

    try {
      console.log(`Listing backups for chat ${chatId}, character:`, character.data?.name);

      // TODO: Backup endpoints not implemented in backend yet
      // const response = await fetch('/api/list-chat-backups', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     character_data: character,
      //     chat_id: chatId
      //   }),
      // });

      // Return empty backups list for now
      return { success: true, backups: [] };
    } catch (error) {
      console.error('Error listing backups:', error);
      return { success: false, error: `Error: ${error}`, backups: [] };
    }
  }

  /**
   * Creates a manual backup of a chat
   * @param character The character associated with the chat
   * @param chatId The ID of the chat to backup
   * @returns Result of the backup operation
   */
  static async createChatBackup(character: CharacterCard, chatId: string): Promise<any> {
    if (!character) {
      console.error('Cannot create backup: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot create backup: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log(`Creating backup for chat ${chatId}, character:`, character.data?.name);

      // TODO: Backup endpoints not implemented in backend yet
      // const response = await fetch('/api/create-chat-backup', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     character_data: character,
      //     chat_id: chatId
      //   }),
      // });

      // Return success for now (no-op)
      return { success: true, message: 'Backup feature not yet implemented' };
    } catch (error) {
      console.error('Error creating backup:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Restores a chat from a backup
   * @param character The character associated with the chat
   * @param chatId The ID of the chat to restore
   * @param backupPath Optional path to a specific backup. If not provided, uses the most recent backup.
   * @returns Result of the restore operation including the restored chat data
   */
  static async restoreChatBackup(character: CharacterCard, chatId: string, backupPath?: string): Promise<any> {
    if (!character) {
      console.error('Cannot restore backup: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot restore backup: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log(`Restoring chat ${chatId} from backup${backupPath ? ': ' + backupPath : ''}`);

      // TODO: Backup endpoints not implemented in backend yet
      // const response = await fetch('/api/restore-chat-backup', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     character_data: character,
      //     chat_id: chatId,
      //     backup_path: backupPath
      //   }),
      // });

      // Return error for now since restore is not implemented
      return { success: false, error: 'Backup restore feature not yet implemented' };
    } catch (error) {
      console.error('Error restoring from backup:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }
}