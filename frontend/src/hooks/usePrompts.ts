// hooks/usePrompts.ts
import { useState, useEffect, useCallback } from 'react';
import { 
  PromptExportSchema, 
  PromptExport, 
} from '../types/promptSchemas';

// Default prompts
const DEFAULT_PROMPTS: Record<string, string> = {
  // System prompts
  system_prompt: 'You are {{char}}, speaking with {{user}}. {{description}} {{personality}}',
  
  // Chat prompts
  chat_starter: 'Start a conversation as {{char}} with {{user}}. {{description}} {{scenario}}',
  chat_continue: 'Continue the conversation. {{chat_history}}',
  
  // Reasoning prompts
  reasoning: '{{char}} is thinking about how to respond to {{user}}\'s message: "{{message}}"',
  
  // Variation prompts
  refresh_variation: 'Generate an alternative response from {{char}} to {{user}}\'s message: "{{message}}"'
};

// Local storage keys
const CUSTOM_PROMPTS_KEY = 'cardshark_custom_prompts';
const MODIFIED_PROMPTS_KEY = 'cardshark_modified_prompts';

export const usePrompts = () => {
  const [prompts, setPrompts] = useState<Record<string, string>>(DEFAULT_PROMPTS);
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load prompts from localStorage on mount
  useEffect(() => {
    try {
      setIsLoading(true);
      
      // Load modified system prompts
      const savedModifiedPrompts = localStorage.getItem(MODIFIED_PROMPTS_KEY);
      const modifiedPrompts = savedModifiedPrompts ? JSON.parse(savedModifiedPrompts) : {};
      
      // Load custom prompts
      const savedCustomPrompts = localStorage.getItem(CUSTOM_PROMPTS_KEY);
      const customPrompts = savedCustomPrompts ? JSON.parse(savedCustomPrompts) : {};
      
      setPrompts({ ...DEFAULT_PROMPTS, ...modifiedPrompts });
      setCustomPrompts(customPrompts);
      setError(null);
    } catch (err) {
      setError('Failed to load prompts from storage');
      console.error('Error loading prompts:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Get all combined prompts (default, modified, and custom)
  const getAllPrompts = useCallback(() => {
    return { ...prompts, ...customPrompts };
  }, [prompts, customPrompts]);
  
  // Get a specific prompt
  const getPrompt = useCallback((key: string): string => {
    // First check custom prompts
    if (customPrompts[key]) {
      return customPrompts[key];
    }
    
    // Then check modified/default prompts
    if (prompts[key]) {
      return prompts[key];
    }
    
    // Return empty string if prompt not found
    console.warn(`Prompt key "${key}" not found`);
    return '';
  }, [prompts, customPrompts]);
  
  // Check if a prompt is custom
  const isCustomPrompt = useCallback((key: string): boolean => {
    return Object.keys(customPrompts).includes(key);
  }, [customPrompts]);
  
  // Get default version of a prompt
  const getDefaultPrompt = useCallback((key: string): string => {
    return DEFAULT_PROMPTS[key] || '';
  }, []);
  
  // Get all keys of custom prompts
  const getCustomPromptKeys = useCallback((): string[] => {
    return Object.keys(customPrompts);
  }, [customPrompts]);
  
  // Update a prompt (could be default or custom)
  const updatePrompt = useCallback((key: string, template: string) => {
    try {
      if (isCustomPrompt(key)) {
        // Update custom prompt
        const updatedCustomPrompts = { ...customPrompts, [key]: template };
        setCustomPrompts(updatedCustomPrompts);
        localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(updatedCustomPrompts));
      } else if (DEFAULT_PROMPTS[key]) {
        // Update a default prompt
        const updatedPrompts = { ...prompts, [key]: template };
        setPrompts(updatedPrompts);
        
        // Save modified prompts to localStorage
        const modifiedPrompts = { ...prompts, [key]: template };
        Object.keys(modifiedPrompts).forEach(k => {
          if (modifiedPrompts[k] === DEFAULT_PROMPTS[k]) {
            delete modifiedPrompts[k];
          }
        });
        localStorage.setItem(MODIFIED_PROMPTS_KEY, JSON.stringify(modifiedPrompts));
      } else {
        throw new Error(`Prompt key "${key}" not found`);
      }
    } catch (err) {
      setError('Failed to update prompt');
      console.error('Error updating prompt:', err);
      throw err;
    }
  }, [prompts, customPrompts, isCustomPrompt]);
  
  // Reset a prompt to its default value
  const resetPrompt = useCallback((key: string) => {
    try {
      if (DEFAULT_PROMPTS[key]) {
        // Reset a default prompt to its original value
        const updatedPrompts = { ...prompts };
        updatedPrompts[key] = DEFAULT_PROMPTS[key];
        setPrompts(updatedPrompts);
        
        // Update modified prompts in localStorage
        const modifiedPrompts = { ...prompts };
        delete modifiedPrompts[key];
        localStorage.setItem(MODIFIED_PROMPTS_KEY, JSON.stringify(modifiedPrompts));
      } else if (customPrompts[key]) {
        // Cannot reset a custom prompt, so we'll just log a warning
        console.warn('Cannot reset a custom prompt. Use deletePrompt instead.');
      } else {
        throw new Error(`Prompt key "${key}" not found`);
      }
    } catch (err) {
      setError('Failed to reset prompt');
      console.error('Error resetting prompt:', err);
      throw err;
    }
  }, [prompts, customPrompts]);
  
  // Create a new custom prompt
  const createCustomPrompt = useCallback((key: string, template: string) => {
    try {
      // Validate key
      if (!key) {
        throw new Error('Prompt key is required');
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
        throw new Error('Prompt key can only contain letters, numbers, and underscores');
      }
      
      // Check if key already exists in default or custom prompts
      if (DEFAULT_PROMPTS[key] || customPrompts[key]) {
        throw new Error(`Prompt key "${key}" already exists`);
      }
      
      // Create the custom prompt
      const updatedCustomPrompts = { ...customPrompts, [key]: template };
      setCustomPrompts(updatedCustomPrompts);
      localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(updatedCustomPrompts));
    } catch (err) {
      setError('Failed to create custom prompt');
      console.error('Error creating custom prompt:', err);
      throw err;
    }
  }, [customPrompts]);
  
  // Delete a custom prompt
  const deleteCustomPrompt = useCallback((key: string): boolean => {
    try {
      if (!customPrompts[key]) {
        console.warn(`Custom prompt "${key}" not found`);
        return false;
      }
      
      // Delete the custom prompt
      const updatedCustomPrompts = { ...customPrompts };
      delete updatedCustomPrompts[key];
      setCustomPrompts(updatedCustomPrompts);
      localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify(updatedCustomPrompts));
      return true;
    } catch (err) {
      setError('Failed to delete custom prompt');
      console.error('Error deleting custom prompt:', err);
      return false;
    }
  }, [customPrompts]);
  
  // Export prompts to JSON
  const exportPrompts = useCallback((): string => {
    try {
      const exportData: PromptExport = {
        prompts: { ...prompts },
        custom: Object.entries(customPrompts).map(([key, template]) => ({
          key,
          template
        })),
        version: '1.0'
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (err) {
      setError('Failed to export prompts');
      console.error('Error exporting prompts:', err);
      return '';
    }
  }, [prompts, customPrompts]);
  
  // Import prompts with validation
  const importPrompts = useCallback((jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      
      // Validate with Zod
      const validationResult = PromptExportSchema.safeParse(data);
      if (!validationResult.success) {
        const errorMessage = validationResult.error.issues[0]?.message || 'Invalid data format';
        throw new Error(`Invalid import format: ${errorMessage}`);
      }
      
      const parsedData = validationResult.data;
      
      // Process the validated data
      const newCustomPrompts: Record<string, string> = {};
      
      // Import modified standard prompts
      if (parsedData.prompts) {
        Object.entries(parsedData.prompts).forEach(([key, value]) => {
          updatePrompt(key, value);
        });
      }
      
      // Import custom prompts
      if (parsedData.custom) {
        parsedData.custom.forEach(({ key, template }) => {
          newCustomPrompts[key] = template;
        });
        
        setCustomPrompts(prev => ({ ...prev, ...newCustomPrompts }));
        localStorage.setItem(CUSTOM_PROMPTS_KEY, JSON.stringify({ ...customPrompts, ...newCustomPrompts }));
      }
      
    } catch (error) {
      console.error('Error importing prompts:', error);
      throw error;
    }
  }, [customPrompts, updatePrompt]);
  
  return {
    prompts: getAllPrompts(),
    isLoading,
    error,
    getPrompt,
    updatePrompt,
    resetPrompt,
    isCustomPrompt,
    getDefaultPrompt,
    createCustomPrompt,
    deleteCustomPrompt,
    exportPrompts,
    importPrompts,
    getCustomPromptKeys,
    getAllPrompts
  };
};