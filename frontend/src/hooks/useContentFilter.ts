import { useCallback, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAPIConfig } from '../contexts/APIConfigContext';
import { APIProvider } from '../types/api';
import { WordSwapRule, extractBannedTokens, applyWordSubstitutions } from '../utils/contentProcessing';

/**
 * Hook to handle content filtering based on word substitution rules
 * Determines the appropriate filtering strategy based on API provider
 */
export function useContentFilter() {
  const { settings } = useSettings();
  const { apiConfig } = useAPIConfig();
  
  // Get the active provider type, defaulting to KoboldCPP if not set
  const activeProvider = apiConfig?.provider || APIProvider.KOBOLD;
  
  // Get word swap rules from settings
  const wordSwapRules = useMemo<WordSwapRule[]>(() => {
    return settings?.wordSwapRules || [];
  }, [settings?.wordSwapRules]);
  
  /**
   * Filter text using client-side word substitution rules
   */
  const filterText = useCallback((text: string): string => {
    return applyWordSubstitutions(text, wordSwapRules);
  }, [wordSwapRules]);
  
  /**
   * Get an array of tokens to be banned at the API level
   */
  const getBannedTokens = useCallback((): string[] => {
    return extractBannedTokens(wordSwapRules);
  }, [wordSwapRules]);
  
  /**
   * Get logit_bias object for OpenAI-compatible APIs
   * Maps token IDs to bias values (-100 effectively bans tokens)
   */
  const getLogitBias = useCallback((): Record<string, number> => {
    // This is a simplified implementation
    // In a real implementation, you would convert words to token IDs using the OpenAI tokenizer
    // For now, we'll return an empty object as actual token ID generation
    // would require a tokenizer that matches the API provider's model
    
    // For a production implementation:
    // 1. You would need to use a tokenizer like GPT-2 Tokenizer
    // 2. Convert each banned word to its token IDs
    // 3. Create a map of token ID -> -100 (to bias against)
    
    const tokens = extractBannedTokens(wordSwapRules);
    if (tokens.length === 0) return {};
    
    // This is a placeholder
    // In a real implementation, you would convert tokens to token IDs
    // const tokenIds = tokens.flatMap(token => tokenizer.encode(token));
    // return tokenIds.reduce((acc, id) => ({ ...acc, [id]: -100 }), {});
    
    return {};
  }, [wordSwapRules]);
  
  /**
   * Get provider-appropriate parameters for API requests
   */
  const getRequestParameters = useCallback(() => {
    if (activeProvider === APIProvider.KOBOLD) {
      return {
        banned_tokens: getBannedTokens()
      };
    } else if (
      activeProvider === APIProvider.OPENAI ||
      activeProvider === APIProvider.OPENROUTER ||
      activeProvider === APIProvider.FEATHERLESS
    ) {
      return {
        logit_bias: getLogitBias()
      };
    }
    
    return {};
  }, [activeProvider, getBannedTokens, getLogitBias]);
  
  return {
    filterText,
    getBannedTokens,
    getLogitBias,
    getRequestParameters,
    wordSwapRules,
    shouldUseClientFiltering: 
      activeProvider !== APIProvider.KOBOLD && 
      activeProvider !== APIProvider.OPENAI &&
      activeProvider !== APIProvider.OPENROUTER &&
      activeProvider !== APIProvider.FEATHERLESS
  };
}
