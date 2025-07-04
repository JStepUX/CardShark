import { APIConfig } from '../types/api';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  reasoning?: string;
}

export interface ChatSession {
  character_uuid: string;
  user_uuid?: string;
  chat_session_uuid: string;
  title: string;
  start_time: string;
  last_message_time?: string;
  message_count: number;
  chat_log_path: string;
  messages?: ChatMessage[];
}

export interface ReliableChatResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

class ReliableChatStorage {
  private apiConfig: APIConfig;

  constructor(apiConfig: APIConfig) {
    this.apiConfig = apiConfig;
  }
  private getApiUrl(): string {
    return this.apiConfig.url || 'http://localhost:9696';
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    body?: any
  ): Promise<ReliableChatResult<T>> {
    try {
      const url = `${this.getApiUrl()}/api/${endpoint}`;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`ReliableChatStorage error (${endpoint}):`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async createNewChat(characterUuid: string, userUuid?: string): Promise<ReliableChatResult<ChatSession>> {
    return this.makeRequest<ChatSession>('reliable-create-chat', 'POST', {
      character_uuid: characterUuid,
      user_uuid: userUuid,
    });
  }

  async loadChat(characterUuid: string, chatSessionUuid: string): Promise<ReliableChatResult<ChatSession>> {
    return this.makeRequest<ChatSession>('reliable-load-chat', 'POST', {
      character_uuid: characterUuid,
      chat_session_uuid: chatSessionUuid,
    });
  }

  async appendMessage(
    characterUuid: string,
    chatSessionUuid: string,
    message: ChatMessage
  ): Promise<ReliableChatResult<ChatSession>> {
    return this.makeRequest<ChatSession>('reliable-append-message', 'POST', {
      character_uuid: characterUuid,
      chat_session_uuid: chatSessionUuid,
      message,
    });
  }

  async saveChat(
    chatSessionUuid: string,
    messages: ChatMessage[]
  ): Promise<ReliableChatResult<ChatSession>> {
    return this.makeRequest<ChatSession>('reliable-save-chat', 'POST', {
      chat_session_uuid: chatSessionUuid,
      messages,
      title: undefined
    });
  }

  async listChats(characterUuid: string): Promise<ReliableChatResult<ChatSession[]>> {
    return this.makeRequest<ChatSession[]>(`reliable-list-chats/${characterUuid}`, 'GET');
  }

  async deleteChat(characterUuid: string, chatSessionUuid: string): Promise<ReliableChatResult<void>> {
    return this.makeRequest<void>(`reliable-delete-chat/${characterUuid}/${chatSessionUuid}`, 'DELETE');
  }

  // Legacy compatibility methods - mirror existing ChatStorage interface
  async loadLatestChat(characterUuid: string): Promise<any> {
    const result = await this.listChats(characterUuid);
    if (result.success && result.data && result.data.length > 0) {
      // Get most recent chat
      const latestChat = result.data.sort((a, b) => 
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      )[0];
      
      // Load the full chat with messages
      return this.loadChat(characterUuid, latestChat.chat_session_uuid);
    }
    
    // No existing chats, create new one
    return this.createNewChat(characterUuid);
  }
}

export default ReliableChatStorage;
