/**
 * Unified Chat Service
 * 
 * Centralizes all API calls for chat operations with proper error handling,
 * type safety, and retry logic. This service addresses the parameter mismatch
 * issues identified in the main useChatMessages hook.
 * 
 * @module chatService
 */

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
const API_BASE_URL = 'http://localhost:9696/api';
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
}

// Create singleton instance
export const chatService = new ChatService();

// Export for testing
export { ChatApiClient };
