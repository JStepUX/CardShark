// chatStorage.ts
import { CharacterData } from '../contexts/CharacterContext';
import { apiService } from './apiService';
import { Message } from '../types/messages';
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
    return apiService.saveChat(characterData, messages, lastUser, apiInfo);
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

  // Get user from local storage
  static getCurrentUser() {
    try {
      const stored = localStorage.getItem('cardshark_current_user');
      if (stored) {
        const userData = JSON.parse(stored);
        if (userData.name && userData.filename) {
          return userData;
        }
      }
      return null;
    } catch (err) {
      console.error('Error loading stored user:', err);
      return null;
    }
  }

  // Save user to local storage
  static saveCurrentUser(user: any) {
    if (user) {
      localStorage.setItem('cardshark_current_user', JSON.stringify({
        name: user.name,
        filename: user.filename,
        size: user.size,
        modified: user.modified
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