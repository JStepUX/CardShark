// src/services/contentFilterClient.ts
import { WordSwapRule } from '../utils/contentProcessing';

/**
 * Client for interacting with the content filter API.
 */
export class ContentFilterClient {
  /**
   * Get all content filtering rules from the server.
   * 
   * @returns A promise that resolves to an array of word swap rules.
   */
  static async getContentFilters(): Promise<WordSwapRule[]> {
    try {
      const response = await fetch('/api/content-filters');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to get content filters (${response.status})`);
      }
      
      const data = await response.json();
      return data.rules || [];
    } catch (error) {
      console.error('Error getting content filters:', error);
      throw error;
    }
  }

  /**
   * Update content filtering rules on the server.
   * 
   * @param rules The rules to update.
   * @returns A promise that resolves when the update is successful.
   */
  static async updateContentFilters(rules: WordSwapRule[]): Promise<void> {
    try {
      const response = await fetch('/api/content-filters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rules })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update content filters (${response.status})`);
      }

      return;
    } catch (error) {
      console.error('Error updating content filters:', error);
      throw error;
    }
  }

  /**
   * Update the remove incomplete sentences setting.
   * 
   * @param enabled Whether to remove incomplete sentences.
   * @returns A promise that resolves when the update is successful.
   */
  static async updateRemoveIncompleteSentences(enabled: boolean): Promise<void> {
    try {
      const response = await fetch('/api/content-filters/incomplete-sentences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update incomplete sentences setting (${response.status})`);
      }

      return;
    } catch (error) {
      console.error('Error updating incomplete sentences setting:', error);
      throw error;
    }
  }
}
