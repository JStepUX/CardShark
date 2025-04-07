import { CharacterCard } from '../types/schema';
import { Message, UserProfile } from '../types/messages';

export class ChatStorage {
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
      
      const response = await fetch('/api/list-character-chats', {
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
   */
  static async loadChat(chatId: string, character: CharacterCard | null): Promise<any> {
    if (!character) {
      console.error('Cannot load chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    if (!chatId) {
      console.error('Cannot load chat: No chat ID provided');
      return { success: false, error: 'No chat ID provided' };
    }

    try {
      console.log('Loading chat with ID:', chatId, 'for character:', character.data?.name);
      
      // Extract character ID
      const characterId = this.getCharacterId(character);
      console.log('Using character ID:', characterId);
      
      const response = await fetch('/api/load-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || ''
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
    apiInfo: any = null
  ): Promise<any> {
    if (!character) {
      console.error('Cannot save chat: No character provided');
      return { success: false, error: 'No character selected' };
    }

    try {
      console.log(`Saving chat with ${messages.length} messages for character:`, character.data?.name);
      
      const characterId = this.getCharacterId(character);
      
      const response = await fetch('/api/save-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || '',
          messages: messages,
          user: currentUser,
          api_info: apiInfo
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
          char_name: character.data?.name || ''
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to load latest chat:', response.status, errorText);
        return { success: false, error: `Failed to load latest chat: ${response.status}` };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading latest chat:', error);
      return { success: false, error: `Error: ${error}` };
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
      console.log('Appending message to chat for character:', character.data?.name);
      
      const characterId = this.getCharacterId(character);
      
      const response = await fetch('/api/append-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_data: character, // Send full character object
          character_id: characterId,
          char_name: character.data?.name || '',
          message: message
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
}