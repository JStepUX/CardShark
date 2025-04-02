/**
 * Transformer utility for KoboldCPP API integration
 * Converts CardShark's internal format to KoboldCPP's expected API format
 */

/**
 * Simple utility to strip HTML tags
 */
function stripHtml(html: string): string {
  if (!html) return '';
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

/**
 * Transforms the CardShark API payload format to match KoboldCPP's expected format
 * while maintaining compatibility with the existing streaming response handling
 */
export function transformKoboldPayload(payload: any) {
  // Extract necessary data from the nested structure
  const { api_config, generation_params } = payload;
  const generationSettings = api_config?.generation_settings || {};
  
  // Extract key parameters and strip any HTML
  const prompt = stripHtml(generation_params.prompt || '');
  
  // Extract character data for the memory field
  const characterData = generation_params.character_data?.data || {};
  
  // Construct the memory field from character data
  let memory = stripHtml(generation_params.memory || '');
  
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
  
  // Ensure max_length is set to a reasonable value
  const max_length = generationSettings.max_length || 320;
  
  // Create a KoboldCPP-compatible payload
  return {
    // Core parameters
    prompt,
    memory,
    stop_sequence: stopSequence,
    
    // Include all generation settings
    ...generationSettings,
    
    // Explicitly set max_length to prevent infinite generation
    max_length,
    
    // Standard parameters that KoboldCPP expects
    n: 1,
    quiet: true,
    trim_stop: true,
    use_default_badwordsids: false,
    bypass_eos: false,
    
    // Add a parameter to signal end of generation
    do_sample: true,
    
    // Force KoboldCPP to send finish_reason
    send_finish_reason: true,
    
    // Always enable streaming
    stream: true
  };
}

/**
 * Builds the correct endpoint URL for KoboldCPP
 */
export function getKoboldStreamEndpoint(baseUrl: string): string {
  let endpoint = baseUrl || 'http://localhost:5001';
  
  // Normalize URL - remove trailing slashes
  endpoint = endpoint.replace(/\/+$/, '');
  
  // Return the proper streaming endpoint
  return `${endpoint}/api/extra/generate/stream`;
}

/**
 * Checks if a response is from KoboldCPP
 */
export function isKoboldResponse(response: Response): boolean {
  // Check for KoboldCPP specific headers
  const headers = response.headers;
  
  // Check server or other headers that might identify KoboldCPP
  return (headers.get('server')?.includes('KoboldCPP') ?? false) ||
         headers.get('x-koboldcpp-version') !== null ||
         (headers.get('content-type')?.includes('text/event-stream') ?? false);
}

/**
 * Execute an immediate, tiny request to wake up KoboldCPP if it's sleeping
 */

/**
 * Attempts to wake a sleeping KoboldCPP server
 * @param url The base URL of the KoboldCPP server
 * @returns Promise that resolves to boolean indicating if the server is ready
 */
export async function wakeKoboldServer(url: string): Promise<boolean> {
  // Normalize the URL
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  // Use the model endpoint as a lightweight way to check if the server is ready
  const modelEndpoint = `${baseUrl}/api/v1/model`;
  
  try {
    // Create an abort controller to handle timeouts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(modelEndpoint, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('KoboldCPP server is awake, model info:', data);
      return true;
    } else {
      console.warn(`KoboldCPP server returned status ${response.status}`);
      return false;
    }
  } catch (err) {
    console.warn('Error waking KoboldCPP server:', err);
    return false; // Return false instead of throwing to be consistent with return type
  }
}