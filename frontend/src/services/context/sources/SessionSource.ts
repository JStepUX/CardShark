/**
 * @file SessionSource.ts
 * @description Context source for chat session data.
 *
 * Provides access to session state including:
 * - Session notes
 * - Session name/title
 * - Compression settings
 * - Current user profile
 *
 * Unlike other sources, SessionSource doesn't cache extensively since session
 * data changes frequently and is managed by React state.
 */

import type { ContextSource, SessionContext, CompressionLevel } from '../../../types/context';
import type { UserProfile } from '../../../types/messages';
import { chatService, SessionSettings } from '../../chat/chatService';
import { ContextCache, CachePresets } from '../ContextCache';

/**
 * Storage keys for session-related data in localStorage.
 */
const STORAGE_KEYS = {
  COMPRESSION_LEVEL: 'cardshark_compression_level',
  CURRENT_USER: 'cardshark_current_user',
} as const;

/**
 * Default session context values.
 */
const DEFAULT_SESSION_CONTEXT: SessionContext = {
  chatSessionUuid: null,
  sessionNotes: '',
  sessionName: '',
  compressionLevel: 'none',
  currentUser: {
    uuid: null,
    name: 'User',
    imagePath: null,
  },
  characterUuid: null,
};

/**
 * Source for session context data.
 *
 * Session data is a mix of:
 * - Backend-persisted data (session notes, title via chatService)
 * - Local storage (compression level, current user)
 * - In-memory state (current chat session UUID)
 *
 * @example
 * ```typescript
 * const source = new SessionSource();
 * await source.setCurrentSession('chat-uuid-123');
 * const context = await source.get('chat-uuid-123');
 * ```
 */
export class SessionSource implements ContextSource<SessionContext> {
  private cache: ContextCache<SessionContext>;
  private currentSessionUuid: string | null = null;
  private currentUser: UserProfile | null = null;
  private compressionLevel: CompressionLevel = 'none';

  constructor() {
    // Short-lived cache since session data changes frequently
    this.cache = new ContextCache<SessionContext>(CachePresets.shortLived());

    // Load persistent settings
    this.loadPersistedSettings();
  }

  /**
   * Get session context by chat session UUID.
   * If no UUID provided, returns current session context.
   */
  async get(uuid: string): Promise<SessionContext | null> {
    // Check cache
    const cached = this.cache.get(uuid);
    if (cached) {
      return cached;
    }

    // Fetch from backend
    return this.fetchAndCache(uuid);
  }

  /**
   * Get the current session context (without UUID lookup).
   */
  async getCurrent(): Promise<SessionContext> {
    if (this.currentSessionUuid) {
      const context = await this.get(this.currentSessionUuid);
      if (context) {
        return context;
      }
    }

    // Return default context with current local state
    return {
      ...DEFAULT_SESSION_CONTEXT,
      compressionLevel: this.compressionLevel,
      currentUser: this.buildUserContext(),
    };
  }

  /**
   * Force refresh session data from backend.
   */
  async refresh(uuid: string): Promise<SessionContext | null> {
    this.cache.invalidate(uuid);
    return this.fetchAndCache(uuid);
  }

  /**
   * Invalidate cached session data.
   */
  invalidate(uuid: string): void {
    this.cache.invalidate(uuid);
  }

  /**
   * Check if session data is cached.
   */
  has(uuid: string): boolean {
    return this.cache.has(uuid);
  }

  /**
   * Clear all cached session data.
   */
  clear(): void {
    this.cache.clear();
  }

  // =========================================================================
  // Session State Management
  // =========================================================================

  /**
   * Set the current active session UUID.
   */
  setCurrentSession(uuid: string | null): void {
    this.currentSessionUuid = uuid;
  }

  /**
   * Get the current session UUID.
   */
  getCurrentSessionUuid(): string | null {
    return this.currentSessionUuid;
  }

  /**
   * Set the current user profile.
   */
  setCurrentUser(user: UserProfile | null): void {
    this.currentUser = user;

    // Persist to localStorage
    if (user) {
      try {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      } catch (e) {
        console.warn('[SessionSource] Failed to persist current user:', e);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }

    // Invalidate current session cache
    if (this.currentSessionUuid) {
      this.cache.invalidate(this.currentSessionUuid);
    }
  }

  /**
   * Get the current user profile.
   */
  getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }

  /**
   * Set the compression level.
   */
  setCompressionLevel(level: CompressionLevel): void {
    this.compressionLevel = level;

    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEYS.COMPRESSION_LEVEL, level);
    } catch (e) {
      console.warn('[SessionSource] Failed to persist compression level:', e);
    }

    // Invalidate current session cache
    if (this.currentSessionUuid) {
      this.cache.invalidate(this.currentSessionUuid);
    }
  }

  /**
   * Get the current compression level.
   */
  getCompressionLevel(): CompressionLevel {
    return this.compressionLevel;
  }

  // =========================================================================
  // Session Settings Persistence
  // =========================================================================

  /**
   * Update session notes on the backend.
   */
  async updateSessionNotes(notes: string): Promise<void> {
    if (!this.currentSessionUuid) {
      console.warn('[SessionSource] No current session to update notes');
      return;
    }

    try {
      await chatService.updateSessionSettings(this.currentSessionUuid, {
        session_notes: notes || null,
      });

      // Update cache
      const cached = this.cache.get(this.currentSessionUuid);
      if (cached) {
        this.cache.set(this.currentSessionUuid, {
          ...cached,
          sessionNotes: notes,
        });
      }
    } catch (error) {
      console.error('[SessionSource] Failed to update session notes:', error);
      throw error;
    }
  }

  /**
   * Update session name/title on the backend.
   */
  async updateSessionName(name: string): Promise<void> {
    if (!this.currentSessionUuid) {
      console.warn('[SessionSource] No current session to update name');
      return;
    }

    try {
      await chatService.updateSessionSettings(this.currentSessionUuid, {
        title: name || null,
      });

      // Update cache
      const cached = this.cache.get(this.currentSessionUuid);
      if (cached) {
        this.cache.set(this.currentSessionUuid, {
          ...cached,
          sessionName: name,
        });
      }
    } catch (error) {
      console.error('[SessionSource] Failed to update session name:', error);
      throw error;
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Fetch session settings from backend and build context.
   */
  private async fetchAndCache(uuid: string): Promise<SessionContext | null> {
    try {
      const settings = await chatService.getSessionSettings(uuid);
      const context = this.buildContext(uuid, settings);
      this.cache.set(uuid, context);
      return context;
    } catch (error) {
      console.error(`[SessionSource] Error fetching session ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Build SessionContext from settings and local state.
   */
  private buildContext(uuid: string, settings: SessionSettings): SessionContext {
    return {
      chatSessionUuid: uuid,
      sessionNotes: settings.session_notes || '',
      sessionName: settings.title || '',
      compressionLevel: this.compressionLevel,
      currentUser: this.buildUserContext(),
      characterUuid: null, // Set by caller based on context
    };
  }

  /**
   * Build user context from current user profile.
   */
  private buildUserContext(): SessionContext['currentUser'] {
    if (!this.currentUser) {
      return {
        uuid: null,
        name: 'User',
        imagePath: null,
      };
    }

    return {
      uuid: this.currentUser.id || null,
      name: this.currentUser.name || 'User',
      imagePath: this.currentUser.filename
        ? `/api/user-image/${encodeURIComponent(this.currentUser.filename)}`
        : null,
    };
  }

  /**
   * Load persisted settings from localStorage.
   */
  private loadPersistedSettings(): void {
    try {
      // Load compression level
      const savedLevel = localStorage.getItem(STORAGE_KEYS.COMPRESSION_LEVEL);
      if (savedLevel && ['none', 'chat_only', 'chat_dialogue', 'aggressive'].includes(savedLevel)) {
        this.compressionLevel = savedLevel as CompressionLevel;
      }

      // Load current user
      const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
      }
    } catch (error) {
      console.warn('[SessionSource] Error loading persisted settings:', error);
    }
  }

  /**
   * Dispose of the source and clean up resources.
   */
  dispose(): void {
    this.cache.dispose();
  }
}

// Singleton instance for shared use
let sharedInstance: SessionSource | null = null;

/**
 * Get the shared SessionSource instance.
 */
export function getSessionSource(): SessionSource {
  if (!sharedInstance) {
    sharedInstance = new SessionSource();
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing).
 */
export function resetSessionSource(): void {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
}
