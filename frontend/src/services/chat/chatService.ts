/**
 * Unified Chat Service
 * 
 * Centralizes all API calls for chat operations with proper error handling,
 * type safety, and retry logic. This service addresses the parameter mismatch
 * issues identified in the main useChatMessages hook.
 * 
 * @module chatService
 */

import { getApiBaseUrl } from '../../utils/apiConfig';
import {
  Message,
  UserProfile,
  ChatSession,
  SaveChatParams,
  SaveChatResult,
  PromptContextMessage,
  isValidMessage,
  isValidUserProfile,
  isValidChatSession,
  validateSaveChatParams
} from './chatTypes';

// API Configuration
const API_BASE_URL = `${getApiBaseUrl()}/api`;
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * API Response wrapper for type safety
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

/**
 * Request configuration options
 */
interface RequestConfig {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  signal?: AbortSignal;
}

/**
 * Chat generation parameters
 */
interface GenerationParams {
  messages: Message[];
  user: UserProfile | null;
  chatSessionUuid: string;
  enableReasoning?: boolean;
  reasoningSettings?: any;
  signal?: AbortSignal;
}

/**
 * Chat generation response
 */
interface GenerationResponse {
  message: Message;
  reasoning?: string;
  stream?: ReadableStream;
}

/**
 * Session settings for context compression and notes
 */
export interface SessionSettings {
  session_notes: string | null;
  compression_enabled: boolean;
  title: string | null;
}

/**
 * Session settings update payload
 */
export interface SessionSettingsUpdate {
  chat_session_uuid: string;
  session_notes?: string | null;
  compression_enabled?: boolean;
}

/**
 * HTTP client with retry logic and proper error handling
 */
class ChatApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl: string = API_BASE_URL, timeout: number = DEFAULT_TIMEOUT) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = timeout;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit & RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retryAttempts = MAX_RETRY_ATTEMPTS,
      retryDelay = RETRY_DELAY,
      signal,
      ...fetchOptions
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        // Create timeout signal
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

        // Combine signals if provided
        const combinedSignal = signal ? this.combineSignals([signal, timeoutController.signal]) : timeoutController.signal;

        const response = await fetch(url, {
          ...fetchOptions,
          signal: combinedSignal,
          headers: {
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          success: true,
          data,
          statusCode: response.status,
        };

      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort or final attempt
        if (this.isAbortError(error) || attempt === retryAttempts) {
          break;
        }

        // Wait before retry
        await this.delay(retryDelay * (attempt + 1));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error occurred',
      statusCode: 0,
    };
  }

  /**
   * Combine multiple abort signals
   */
  private combineSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    signals.forEach(signal => {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort());
      }
    });

    return controller.signal;
  }

  /**
   * Check if error is due to abort
   */
  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (
      error.name === 'AbortError' ||
      error.message.includes('aborted') ||
      error.message.includes('cancelled')
    );
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request wrapper
   */
  async get<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { ...config, method: 'GET' });
  }

  /**
   * POST request wrapper
   */
  async post<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request wrapper
   */
  async put<T>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request wrapper
   */
  async delete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>(endpoint, { ...config, method: 'DELETE' });
  }
}

// Create singleton instance
const apiClient = new ChatApiClient();

/**
 * Chat Service - High-level chat operations
 */
export class ChatService {
  private client: ChatApiClient;

  constructor(client: ChatApiClient = apiClient) {
    this.client = client;
  }

  /**
   * Save chat data with proper parameter validation
   * 
   * This method fixes the parameter mismatch issue identified in the main hook
   * by ensuring proper parameter order and type validation.
   */
  async saveChat(params: SaveChatParams): Promise<SaveChatResult> {    // Validate parameters using type guards
    const validation = validateSaveChatParams(params);
    if (!validation.success) {
      throw new Error(`Invalid save chat parameters: ${validation.error}`);
    }

    const { chatSessionUuid, messages, user } = params;

    // Additional runtime validation
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    if (!Array.isArray(messages)) {
      throw new Error('messages must be an array');
    }

    // Validate each message
    const invalidMessages = messages.filter(msg => !isValidMessage(msg));
    if (invalidMessages.length > 0) {
      throw new Error(`Invalid messages found: ${invalidMessages.length} messages failed validation`);
    }

    // Validate user profile if provided
    if (user && !isValidUserProfile(user)) {
      throw new Error('Invalid user profile provided');
    }

    try {
      const response = await this.client.post<SaveChatResult>('/chat/save', {
        chatSessionUuid,
        messages,
        user,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to save chat');
      }

      return response.data!;
    } catch (error) {
      console.error('Failed to save chat:', error);
      throw error;
    }
  }

  /**
   * Load chat by session UUID
   */
  async loadChat(chatSessionUuid: string): Promise<ChatSession | null> {
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    try {
      const response = await this.client.get<ChatSession>(`/chat/load/${chatSessionUuid}`);

      if (!response.success) {
        if (response.statusCode === 404) {
          return null; // Chat not found
        }
        throw new Error(response.error || 'Failed to load chat');
      }

      const chatSession = response.data!;

      // Validate loaded chat session
      if (!isValidChatSession(chatSession)) {
        throw new Error('Invalid chat session data received from server');
      }

      return chatSession;
    } catch (error) {
      console.error('Failed to load chat:', error);
      throw error;
    }
  }

  /**
   * Generate AI response with proper streaming support
   */
  async generateResponse(params: GenerationParams): Promise<GenerationResponse> {
    const { messages, user, chatSessionUuid, enableReasoning, reasoningSettings, signal } = params;

    // Validate parameters
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages must be a non-empty array');
    }

    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    // Validate messages
    const invalidMessages = messages.filter(msg => !isValidMessage(msg));
    if (invalidMessages.length > 0) {
      throw new Error(`Invalid messages found: ${invalidMessages.length} messages failed validation`);
    }

    // Validate user if provided
    if (user && !isValidUserProfile(user)) {
      throw new Error('Invalid user profile provided');
    }

    try {
      const response = await this.client.post<GenerationResponse>('/chat/generate', {
        messages,
        user,
        chatSessionUuid,
        enableReasoning,
        reasoningSettings,
      }, {
        signal,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate response');
      }

      return response.data!;
    } catch (error) {
      console.error('Failed to generate response:', error);
      throw error;
    }
  }

  /**
   * Get chat history for context
   */
  async getChatHistory(chatSessionUuid: string, limit?: number): Promise<Message[]> {
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    try {
      const endpoint = `/chat/history/${chatSessionUuid}${limit ? `?limit=${limit}` : ''}`;
      const response = await this.client.get<Message[]>(endpoint);

      if (!response.success) {
        throw new Error(response.error || 'Failed to get chat history');
      }

      const messages = response.data!;

      // Validate messages
      const invalidMessages = messages.filter(msg => !isValidMessage(msg));
      if (invalidMessages.length > 0) {
        console.warn(`Invalid messages in history: ${invalidMessages.length} messages failed validation`);
        // Return only valid messages
        return messages.filter(msg => isValidMessage(msg));
      }

      return messages;
    } catch (error) {
      console.error('Failed to get chat history:', error);
      throw error;
    }
  }

  /**
   * Create new chat session
   */
  async createChatSession(user: UserProfile | null): Promise<ChatSession> {
    // Validate user if provided
    if (user && !isValidUserProfile(user)) {
      throw new Error('Invalid user profile provided');
    }

    try {
      const response = await this.client.post<ChatSession>('/chat/session/create', {
        user,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to create chat session');
      }

      const chatSession = response.data!;

      // Validate created chat session
      if (!isValidChatSession(chatSession)) {
        throw new Error('Invalid chat session data received from server');
      }

      return chatSession;
    } catch (error) {
      console.error('Failed to create chat session:', error);
      throw error;
    }
  }

  /**
   * Get prompt context messages
   */
  async getPromptContext(chatSessionUuid: string): Promise<PromptContextMessage[]> {
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    try {
      const response = await this.client.get<PromptContextMessage[]>(`/chat/context/${chatSessionUuid}`);

      if (!response.success) {
        throw new Error(response.error || 'Failed to get prompt context');
      }

      return response.data! || [];
    } catch (error) {
      console.error('Failed to get prompt context:', error);
      throw error;
    }
  }

  /**
   * Get session settings (notes and compression)
   */
  async getSessionSettings(chatSessionUuid: string): Promise<SessionSettings> {
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    try {
      const response = await this.client.get<SessionSettings>(`/chat/session-settings/${chatSessionUuid}`);

      if (!response.success) {
        throw new Error(response.error || 'Failed to get session settings');
      }

      return response.data!;
    } catch (error) {
      console.error('Failed to get session settings:', error);
      throw error;
    }
  }

  /**
   * Update session settings (notes and compression)
   */
  async updateSessionSettings(
    chatSessionUuid: string,
    settings: Partial<SessionSettings>
  ): Promise<void> {
    if (!chatSessionUuid || typeof chatSessionUuid !== 'string') {
      throw new Error('chatSessionUuid must be a non-empty string');
    }

    try {
      const payload: SessionSettingsUpdate = {
        chat_session_uuid: chatSessionUuid,
        ...settings,
      };

      const response = await this.client.post<{ success: boolean }>('/chat/session-settings', payload);

      if (!response.success) {
        throw new Error(response.error || 'Failed to update session settings');
      }
    } catch (error) {
      console.error('Failed to update session settings:', error);
      throw error;
    }
  }

  /**
   * Fork a chat session at a specific message index
   * 
   * Creates a new chat session with messages copied from the source chat,
   * from index 0 to forkAtMessageIndex (inclusive). The original chat
   * is preserved unchanged.
   * 
   * @param sourceChatUuid - UUID of the source chat to fork from
   * @param forkAtMessageIndex - Index of the last message to include (0-based, inclusive)
   * @param characterUuid - UUID of the character for the new chat
   * @param userUuid - Optional UUID of the user
   * @returns The new chat session UUID
   */
  async forkChat(
    sourceChatUuid: string,
    forkAtMessageIndex: number,
    characterUuid: string,
    userUuid?: string
  ): Promise<string> {
    if (!sourceChatUuid || typeof sourceChatUuid !== 'string') {
      throw new Error('sourceChatUuid must be a non-empty string');
    }

    if (typeof forkAtMessageIndex !== 'number' || forkAtMessageIndex < 0) {
      throw new Error('forkAtMessageIndex must be a non-negative number');
    }

    if (!characterUuid || typeof characterUuid !== 'string') {
      throw new Error('characterUuid must be a non-empty string');
    }

    try {
      const response = await this.client.post<{
        success: boolean;
        data: {
          chat_session_uuid: string;
          messages: any[];
          title: string;
        };
      }>('/fork-chat', {
        source_chat_session_uuid: sourceChatUuid,
        fork_at_message_index: forkAtMessageIndex,
        character_uuid: characterUuid,
        user_uuid: userUuid,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fork chat');
      }

      // Handle wrapped DataResponse format
      const data = response.data as any;
      const chatSessionUuid = data.data?.chat_session_uuid || data.chat_session_uuid;

      if (!chatSessionUuid) {
        throw new Error('No chat_session_uuid returned from fork operation');
      }

      console.log(`Chat forked successfully: ${sourceChatUuid} -> ${chatSessionUuid}`);
      return chatSessionUuid;
    } catch (error) {
      console.error('Failed to fork chat:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const chatService = new ChatService();

// Export for testing
export { ChatApiClient };
