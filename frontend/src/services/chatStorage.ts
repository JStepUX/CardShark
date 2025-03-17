// chatStorage.ts
import { CharacterData } from '../contexts/CharacterContext';
import { apiService } from './apiService';
import { Message, UserProfile } from '../types/messages';
import { getCharacterId } from '../utils/characterLoader';

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
  static async saveChat(characterData: CharacterData, messages: Message[], lastUser?: any, apiInfo?: any) {
    console.debug(`ChatStorage.saveChat called with ${messages.length} messages`);
    console.debug('Character name:', characterData?.data?.name);
    
    try {
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

  // Get user from local storage - FIXED version with ID handling
  static getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem('cardshark_current_user');
      if (stored) {
        const userData = JSON.parse(stored);
        if (userData.name && userData.filename) {
          // Add an ID if not present
          if (!userData.id) {
            userData.id = `user_${userData.name}_${Date.now()}`;
          }
          return userData as UserProfile;
        }
      }
      return null;
    } catch (err) {
      console.error('Error loading stored user:', err);
      return null;
    }
  }

  // Save user to local storage - FIXED version to include ID
  static saveCurrentUser(user: UserProfile | null) {
    if (user) {
      localStorage.setItem('cardshark_current_user', JSON.stringify({
        id: user.id,
        name: user.name,
        filename: user.filename,
        size: user.size,
        modified: user.modified,
        avatar: user.avatar,
        color: user.color
      }));
    } else {
      localStorage.removeItem('cardshark_current_user');
    }
  }

  // Get character ID from character data
  static getCharacterId(character: CharacterData | null): string | null {
    return getCharacterId(character);
  }
}