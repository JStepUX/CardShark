// Feature flag management for CardShark
export interface FeatureFlags {
  useReliableChat: boolean;
  debugMode: boolean;
}

// Default feature flags
const DEFAULT_FLAGS: FeatureFlags = {
  useReliableChat: false,
  debugMode: false,
};

class FeatureFlagManager {
  private flags: FeatureFlags;
  private listeners: Array<(flags: FeatureFlags) => void> = [];

  constructor() {
    // Load from localStorage or use defaults
    this.flags = this.loadFlags();
  }

  private loadFlags(): FeatureFlags {
    try {
      const stored = localStorage.getItem('cardshark_feature_flags');
      if (stored) {
        return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load feature flags from localStorage:', error);
    }
    return { ...DEFAULT_FLAGS };
  }

  private saveFlags(): void {
    try {
      localStorage.setItem('cardshark_feature_flags', JSON.stringify(this.flags));
    } catch (error) {
      console.warn('Failed to save feature flags to localStorage:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.flags));
  }

  // Get current flag values
  getFlags(): FeatureFlags {
    return { ...this.flags };
  }

  // Check if a specific flag is enabled
  isEnabled(flag: keyof FeatureFlags): boolean {
    return this.flags[flag];
  }

  // Set a flag value
  setFlag(flag: keyof FeatureFlags, value: boolean): void {
    this.flags[flag] = value;
    this.saveFlags();
    this.notifyListeners();
  }

  // Subscribe to flag changes
  subscribe(listener: (flags: FeatureFlags) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Enable reliable chat system
  enableReliableChat(): void {
    this.setFlag('useReliableChat', true);
  }

  // Disable reliable chat system
  disableReliableChat(): void {
    this.setFlag('useReliableChat', false);
  }

  // Toggle reliable chat system
  toggleReliableChat(): void {
    this.setFlag('useReliableChat', !this.flags.useReliableChat);
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlagManager();

// React hook for using feature flags
import { useState, useEffect } from 'react';

export function useFeatureFlags(): FeatureFlags & {
  setFlag: (flag: keyof FeatureFlags, value: boolean) => void;
  toggleReliableChat: () => void;
} {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlags.getFlags());

  useEffect(() => {
    const unsubscribe = featureFlags.subscribe(setFlags);
    return unsubscribe;
  }, []);

  return {
    ...flags,
    setFlag: featureFlags.setFlag.bind(featureFlags),
    toggleReliableChat: featureFlags.toggleReliableChat.bind(featureFlags),
  };
}
