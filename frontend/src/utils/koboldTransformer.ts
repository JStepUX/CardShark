/**
 * Transformer utility for KoboldCPP API integration
 * Converts CardShark's internal format to KoboldCPP's expected API format
 */

/**
 * Transforms the CardShark API payload format to match KoboldCPP's expected format
 * while maintaining compatibility with the existing streaming response handling
 */
export function transformKoboldPayload(payload: any) {
  // Extract necessary data from the nested structure
  const { api_config, generation_params } = payload;
  const generationSettings = api_config?.generation_settings || {};
  
  // Extract key parameters
  const prompt = generation_params.prompt || '';
  
  // Extract character data for the memory field
  const characterData = generation_params.character_data?.data || {};
  
  // Construct the memory field from character data
  let memory = generation_params.memory || '';
  
  // If memory field is empty, construct it from character data
  if (!memory && characterData) {
    memory = [
      characterData.system_prompt || '',
      `Persona: ${characterData.description || ''}`,
      `Personality: ${characterData.personality || ''}`,
      `Scenario: ${characterData.scenario || ''}`
    ].filter(Boolean).join('\n');
  }
  
  // Get stop sequences
  const stopSequence = generation_params.stop_sequence || [];
  
  // Create a KoboldCPP-compatible payload
  return {
    // Core parameters
    prompt,
    memory,  // Now properly constructed
    stop_sequence: stopSequence,
    
    // Include all generation settings
    ...generationSettings,
    
    // Standard parameters that KoboldCPP expects
    n: 1,
    quiet: true,
    trim_stop: true,
    use_default_badwordsids: false,
    bypass_eos: false,
    
    // Enable streaming
    stream: true
  };
}

/**
 * Builds the correct endpoint URL for KoboldCPP
 */
export function getKoboldStreamEndpoint(baseUrl: string): string {
  let endpoint = baseUrl || 'http://localhost:5001';
  if (!endpoint.endsWith('/')) {
    endpoint += '/';
  }
  return `${endpoint}api/extra/generate/stream`;
}
