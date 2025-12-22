// services/promptService.ts
import { PromptTemplate, PromptExport } from '../types/promptTypes';

/**
 * Service for managing customizable prompts used in various generation scenarios
 */
class PromptService {
  private prompts: Map<string, string> = new Map();
  private localStorageKey = 'cardshark_prompts';

  // Default prompts that ship with the application
  private readonly DEFAULT_PROMPTS: Record<string, string> = {
    // Reasoning/thinking prompt template
    reasoning: "You are {{char}}. Think through how you would respond to {{user}}'s message. Consider your character, your relationship with the user, and relevant context from the conversation history. The user's message is: {{message}}",

    // Variation/refresh generation prompt template
    refreshVariation: "You are {{char}}. Create a new response to the message: \"{{message}}\". Your previous response was: \"{{previous_response}}\". Create a completely different response that captures your character but explores a new direction. Avoid repeating phrases from your previous response.",

    // Introduction message generation prompt template
    generateIntro: "#Generate an alternate first message for {{char}}. ##Only requirements: - Establish the world: Where are we? What does it feel like here? - Establish {{char}}'s presence (not bio): How do they occupy this space? Everything else (tone, structure, acknowledging/ignoring {{user}}, dialogue/action/interiority, length) is your choice. ##Choose what best serves this character in this moment. ##Goal: Create a scene unique to {{char}} speaking only for {{char}}",

    // System instruction prompt template
    systemInstruction: "You are {{char}}. Here are your characteristics:\nDescription: {{description}}\nPersonality: {{personality}}\nScenario: {{scenario}}\n\nYou must stay in character at all times and never break the fourth wall or acknowledge you are an AI. Always respond as {{char}} would, based on the information provided.",

    // Context refresher prompt template
    contextRefresher: "Let's summarize the key elements of the conversation so far, focusing on important plot points, character development, and any promises or commitments made. This will help maintain context and continuity for {{char}}.\n\nCharacter: {{char}}\nKey points from the conversation:\n{{key_points}}"
  };

  /**
   * Initialize the prompt service
   */
  constructor() {
    this.loadPrompts();

    // Log loaded prompts for debugging
    console.log('PromptService initialized with the following prompts:');
    for (const [key, value] of this.prompts.entries()) {
      console.log(`- ${key}: ${value.substring(0, 50)}...`);
    }
  }

  /**
   * Get a prompt by key
   * @param key The prompt key
   * @returns The prompt template string
   */
  getPrompt(key: string): string {
    // Get from custom prompts, fallback to defaults
    return this.prompts.get(key) || this.DEFAULT_PROMPTS[key] || '';
  }

  /**
   * Get all prompt keys
   * @returns Array of all prompt keys
   */
  getAllPromptKeys(): string[] {
    // Combine keys from custom prompts and defaults
    const allKeys = new Set([
      ...Object.keys(this.DEFAULT_PROMPTS),
      ...Array.from(this.prompts.keys())
    ]);
    return Array.from(allKeys);
  }

  /**
   * Get all prompts
   * @returns Record of all prompts by key
   */
  getAllPrompts(): Record<string, string> {
    const allPrompts: Record<string, string> = {};

    // Start with defaults
    Object.entries(this.DEFAULT_PROMPTS).forEach(([key, value]) => {
      allPrompts[key] = value;
    });

    // Override with custom prompts
    this.prompts.forEach((value, key) => {
      allPrompts[key] = value;
    });

    return allPrompts;
  }

  /**
   * Set a custom prompt
   * @param key The prompt key
   * @param template The prompt template string
   */
  setPrompt(key: string, template: string): void {
    this.prompts.set(key, template);
    this.savePrompts();
  }

  /**
   * Reset a prompt to its default
   * @param key The prompt key to reset
   * @returns True if reset was successful, false if no default exists
   */
  resetPrompt(key: string): boolean {
    if (this.DEFAULT_PROMPTS[key]) {
      if (this.prompts.has(key)) {
        this.prompts.delete(key);
        this.savePrompts();
      }
      return true;
    }
    return false;
  }

  /**
   * Reset all prompts to defaults
   */
  resetAllPrompts(): void {
    this.prompts.clear();
    this.savePrompts();
  }

  /**
   * Check if a prompt has been customized
   * @param key The prompt key
   * @returns True if the prompt has been customized
   */
  isCustomPrompt(key: string): boolean {
    return this.prompts.has(key);
  }

  /**
   * Get the default prompt template
   * @param key The prompt key
   * @returns The default prompt template or empty string
   */
  getDefaultPrompt(key: string): string {
    return this.DEFAULT_PROMPTS[key] || '';
  }

  /**
   * Export prompts to a format suitable for saving
   * @returns PromptExport object
   */
  exportPrompts(): PromptExport {
    const promptTemplates: PromptTemplate[] = [];

    this.prompts.forEach((template, key) => {
      promptTemplates.push({
        id: key,
        template,
        isCustom: true
      });
    });

    return {
      templates: promptTemplates,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import prompts from an export object
   * @param exportData PromptExport object
   * @returns Number of prompts imported
   */
  importPrompts(exportData: PromptExport): number {
    if (!exportData || !exportData.templates || !Array.isArray(exportData.templates)) {
      return 0;
    }

    let importCount = 0;

    for (const template of exportData.templates) {
      if (template.id && template.template) {
        this.prompts.set(template.id, template.template);
        importCount++;
      }
    }

    if (importCount > 0) {
      this.savePrompts();
    }

    return importCount;
  }

  /**
   * Load prompts from localStorage
   */
  private loadPrompts(): void {
    try {
      const savedPrompts = localStorage.getItem(this.localStorageKey);
      if (savedPrompts) {
        const parsedData = JSON.parse(savedPrompts);

        // Handle both object and array formats
        if (Array.isArray(parsedData)) {
          // Array format (older)
          parsedData.forEach(item => {
            if (item.id && item.template) {
              this.prompts.set(item.id, item.template);
            }
          });
        } else if (typeof parsedData === 'object') {
          // Object format (newer)
          Object.entries(parsedData).forEach(([key, value]) => {
            if (typeof value === 'string') {
              this.prompts.set(key, value);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load custom prompts:', error);
    }
  }

  /**
   * Save prompts to localStorage
   */
  private savePrompts(): void {
    try {
      // Convert Map to object for storage
      const promptsObj: Record<string, string> = {};
      this.prompts.forEach((value, key) => {
        promptsObj[key] = value;
      });

      localStorage.setItem(this.localStorageKey, JSON.stringify(promptsObj));
    } catch (error) {
      console.error('Failed to save custom prompts:', error);
    }
  }
}

// Create and export a singleton instance
export const promptService = new PromptService();