/**
 * @file streamParser.ts
 * @description SSE stream parser for LLM API responses.
 *
 * Handles multiple response formats:
 * - KoboldCPP: { content: string }
 * - OpenAI/OpenRouter: { choices: [{ delta: { content } }] }
 * - Featherless: { raw_featherless_payload: string }
 * - Generic token format: { token: string }
 *
 * Extracted from PromptHandler.streamResponse() (promptHandler.ts:931-1098).
 */

const DEBUG = false;

/**
 * Async generator for streaming content from an LLM API response.
 *
 * @param response - The fetch Response to stream from (must be SSE format)
 * @param characterName - Optional character name to strip from the first chunk (ghost suffix removal)
 * @yields Individual text chunks as they arrive
 */
export async function* streamResponse(
  response: Response,
  characterName?: string
): AsyncGenerator<string, void, unknown> {
  if (!response.ok) {
    throw new Error(`API responded with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isFirstChunk = true;

  /**
   * Strip character name marker from the first chunk.
   * Removes the echoed ghost suffix from the response.
   */
  const stripCharacterMarker = (text: string): string => {
    if (!isFirstChunk || !characterName || !text) {
      return text;
    }

    isFirstChunk = false;

    // Escape special regex characters in character name
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Strip leading character marker (case-insensitive, with optional whitespace)
    const regex = new RegExp(`^\\s*${escapedName}\\s*:\\s*`, 'i');
    const stripped = text.replace(regex, '');

    if (stripped !== text && DEBUG) {
      console.log(`Ghost suffix stripped from first chunk: "${text.substring(0, 50)}..." -> "${stripped.substring(0, 50)}..."`);
    }

    return stripped;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process lines in buffer
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, lineEnd).trim();
        buffer = buffer.substring(lineEnd + 1);

        if (!line) continue;

        // Check if it's SSE format (data: prefix)
        if (line.startsWith('data: ')) {
          const data = line.substring(6);

          // Handle completion marker
          if (data === '[DONE]') {
            if (DEBUG) console.log('Stream complete marker received');
            continue;
          }
          try {
            // Parse the JSON data
            const parsed = JSON.parse(data);
            if (DEBUG) console.log(`[streamResponse] Parsed data:`, parsed);

            // Skip role-only chunks
            if (parsed.delta_type === 'role' && parsed.role === 'assistant') {
              if (DEBUG) console.log('[OpenRouter] Received role marker for assistant');
              continue;
            }

            // Handle generic token format
            if (parsed.token !== undefined) {
              if (DEBUG) console.log(`[streamResponse] Yielding token: "${parsed.token}"`);
              yield stripCharacterMarker(parsed.token);
              continue;
            }

            // Handle Featherless adapter specific format
            if (parsed.raw_featherless_payload !== undefined) {
              try {
                const featherlessData = JSON.parse(parsed.raw_featherless_payload);

                // Handle chat completions format
                if (featherlessData.choices && featherlessData.choices[0]) {
                  if (featherlessData.choices[0].message && featherlessData.choices[0].message.content) {
                    yield stripCharacterMarker(featherlessData.choices[0].message.content);
                    continue;
                  } else if (featherlessData.choices[0].delta && featherlessData.choices[0].delta.content) {
                    yield stripCharacterMarker(featherlessData.choices[0].delta.content);
                    continue;
                  } else if (featherlessData.choices[0].text) {
                    yield stripCharacterMarker(featherlessData.choices[0].text);
                    continue;
                  }
                }

                if (featherlessData.content) {
                  yield stripCharacterMarker(featherlessData.content);
                  continue;
                }

                if (DEBUG) console.log('Unrecognized Featherless response format:', featherlessData);
              } catch (parseError) {
                console.warn('Could not parse Featherless raw payload:', parseError);
                yield stripCharacterMarker(parsed.raw_featherless_payload);
              }
              continue;
            }

            // OpenAI/OpenRouter format: choices[0].delta.content
            if (parsed.choices && parsed.choices[0]?.delta?.content) {
              yield stripCharacterMarker(parsed.choices[0].delta.content);
              continue;
            }

            // KoboldCPP and other formats - check for content field
            if (parsed.hasOwnProperty('content')) {
              if (DEBUG) console.log(`[streamResponse] Yielding content: "${parsed.content}"`);
              yield stripCharacterMarker(parsed.content);
              continue;
            }

            // Handle special formats with empty content that should be skipped
            if (parsed.delta_type === 'empty_delta' || parsed.delta_type === 'processing') {
              if (DEBUG) console.log(`[streamResponse] Skipping empty delta: ${parsed.delta_type}`);
              continue;
            }

            // Unrecognized format
            console.warn('Unrecognized response format:', parsed);
            console.warn('Parsed content:', parsed.content);
            console.warn('Has content property:', parsed.hasOwnProperty('content'));
            console.warn('Has token property:', parsed.hasOwnProperty('token'));
          } catch (error) {
            console.warn('Failed to parse SSE data:', error);
            yield stripCharacterMarker(data);
          }
        } else {
          // Non-SSE format, yield as is
          yield stripCharacterMarker(line);
        }
      }
    }

    // Don't forget any remaining content in the buffer
    if (buffer.trim()) {
      yield stripCharacterMarker(buffer.trim());
    }
  } finally {
    reader.releaseLock();
  }
}
