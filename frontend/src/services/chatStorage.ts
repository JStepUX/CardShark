import { CharacterCard } from '../types/schema';
import { Message, UserProfile } from '../types/messages';

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
          api_config: apiConfig
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
   * @returns A promise that resolves to the generated greeting
   */
  static async generateGreetingStream(characterData: any, apiConfig: any): Promise<{ success: boolean; greeting?: string; message?: string }> {
    // NOTE: Replaced streaming logic with non-streaming logic from generateGreeting
    // as the /api/generate-greeting/stream endpoint doesn't exist in main.py
    try {
      // Use the dedicated greeting generation endpoint
      const response = await fetch("/api/generate-greeting", { // Changed endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          character_data: characterData,
          api_config: apiConfig
          // Note: The non-streaming backend endpoint builds its own prompt/memory
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
        throw new Error(errorData.message || `API responded with status ${response.status}`);
      }

      // For this endpoint, we expect a direct JSON response
      const data = await response.json();

      if (!data.success || !data.greeting) {
        // Use the message from the backend if available
        throw new Error(data.message || "Failed to generate greeting (backend error)");
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
   * Extracts a character ID from various possible locations in a character object
   */
  static getCharacterId(character: CharacterCard): string {
    // If we have a character ID already, use it
    if ((character as any).character_id) {
      return (character as any).character_id;
    }
    
    // Otherwise, construct an ID from the character name
    if (character.data?.name) {
      // Use 8 characters of a hash as a simple unique identifier
      const hash = this.simpleHash(character.data.name);
      return `${character.data.name}-${hash}`;
    }
    
    // Fallback
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
      const response = await fetch('/api/list-character-chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || '',
          format: 'jsonl',
          scan_all_files: true // Add flag to scan for all JSONL files
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to list chats:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      console.log('Chat list received:', data);
      return data.chats || [];
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
      
      const response = await fetch('/api/load-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId, // Could be null to let backend use active chat
          character_data: character, // Send the full character object
          use_active: chatId === null, // Signal to the backend to use the active chat
          scan_all_files: true // Add parameter to scan all JSONL files
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
      const characterId = this.getCharacterId(character);
      console.log('Using character ID:', characterId);
      
      const response = await fetch('/api/create-new-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || '',
          format: 'jsonl'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create new chat:', response.status, errorText);
        return { success: false, error: `Failed to create chat: ${response.status}` };
      }

      const data = await response.json();
      console.log('New chat created:', data);
      return data;
    } catch (error) {
      console.error('Error creating new chat:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }

  /**
   * Saves a chat session
   */
  static async saveChat(
    character: CharacterCard, 
    messages: Message[], 
    currentUser: UserProfile | null,
    apiInfo: any = null,
    backgroundSettings: any = null  // Added parameter for background settings
  ): Promise<any> {
    if (!character) {
      console.error('Cannot save chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      console.log(`Saving chat with ${messages.length} messages for character:`, character.data?.name);
      
      // Get any stored background settings from localStorage if not provided
      if (!backgroundSettings) {
        try {
          const storedSettings = localStorage.getItem('cardshark_background_settings');
          if (storedSettings) {
            backgroundSettings = JSON.parse(storedSettings);
          }
        } catch (e) {
          console.warn('Failed to load background settings from localStorage:', e);
        }
      }
      
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          messages: messages,
          lastUser: currentUser, // Corrected key name
          api_info: apiInfo,
          metadata: {
            backgroundSettings: backgroundSettings,  // Add background settings to metadata
          }
        }),
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
      
      const characterId = this.getCharacterId(character);
      console.log('Using character ID:', characterId);
      
      const response = await fetch('/api/load-latest-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || '',
          scan_all_files: true // Add parameter to ensure we scan all chat files
        }),
      });

      // More detailed logging for debugging response issues
      console.log(`Latest chat response status: ${response.status}`);
      
      if (response.status === 404) {
        console.log('Received 404 from /api/load-latest-chat, treating as "no chats found"');
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
      
      // Handle empty success responses from Featherless
      if (data.success === true && !data.chatId && !data.messages) {
        console.log('API returned success but no chat ID or messages, treating as "no chats found"');
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
      
      return data;
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
  static async appendMessage(character: CharacterCard, message: Message): Promise<any> {
    if (!character) {
      console.error('Cannot append message: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      // Ensure we're using the consistent character name from character data
      const characterName = character.data?.name || '';
      console.log(`Appending message to chat for character: ${characterName}`);
      
      const characterId = this.getCharacterId(character);
      
      // Create a normalized message that ensures character name consistency
      const normalizedMessage = {
        ...message,
        characterName: characterName // Add explicit character name to the message
      };
      
      const response = await fetch('/api/append-chat-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: characterName, // Use the consistent name
          message: normalizedMessage
        }),
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
      
      // Extract character ID
      const characterId = this.getCharacterId(character);
      
      const response = await fetch('/api/delete-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          character_data: character, // Send full character object
          character_id: characterId
        }),
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
      
      const response = await fetch('/api/list-chat-backups', {
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
        console.error('Failed to list backups:', response.status, errorText);
        return { success: false, error: `Failed to list backups: ${response.status}`, backups: [] };
      }

      const data = await response.json();
      return data;
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
      
      const response = await fetch('/api/create-chat-backup', {
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
        console.error('Failed to create backup:', response.status, errorText);
        return { success: false, error: `Failed to create backup: ${response.status}` };
      }

      const data = await response.json();
      return data;
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
      
      const response = await fetch('/api/restore-chat-backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character,
          chat_id: chatId,
          backup_path: backupPath
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to restore from backup:', response.status, errorText);
        return { success: false, error: `Failed to restore from backup: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error restoring from backup:', error);
      return { success: false, error: `Error: ${error}` };
    }
  }
}