/**
 * Service for making resilient API calls with automatic retries and error handling
 */
export class ResilientApiService {
  /**
   * Default retry count for API calls
   */
  private static DEFAULT_RETRY_COUNT = 3;
  
  /**
   * Default retry delay in milliseconds
   */
  private static DEFAULT_RETRY_DELAY = 1500;

  /**
   * Make a GET request with automatic retries
   * 
   * @param url The URL to fetch
   * @param options Optional fetch options
   * @param retryOptions Options for retrying the request
   * @returns Promise resolving to the JSON response
   */
  static async get<T>(
    url: string, 
    options?: RequestInit,
    retryOptions?: { retryCount?: number; retryDelay?: number }
  ): Promise<T> {
    const { retryCount = this.DEFAULT_RETRY_COUNT, retryDelay = this.DEFAULT_RETRY_DELAY } = retryOptions || {};
    let lastError: Error | null = null;
    
    // Try the request with retries
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          ...options,
        });
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
        }
        
        return await response.json() as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error occurred');
        
        // Log the error
        console.error(`API request failed (${url}), attempt ${attempt + 1}/${retryCount + 1}:`, lastError);
        
        // If we haven't reached the max retry count, wait before trying again
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`Retrying request to ${url}...`);
        }
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to fetch from ${url} after ${retryCount} retries`);
  }
  
  /**
   * Make a POST request with automatic retries
   * 
   * @param url The URL to post to
   * @param data The data to send in the request body
   * @param options Optional fetch options
   * @param retryOptions Options for retrying the request
   * @returns Promise resolving to the JSON response
   */
  static async post<T, D = any>(
    url: string,
    data: D,
    options?: RequestInit,
    retryOptions?: { retryCount?: number; retryDelay?: number }
  ): Promise<T> {
    const { retryCount = this.DEFAULT_RETRY_COUNT, retryDelay = this.DEFAULT_RETRY_DELAY } = retryOptions || {};
    let lastError: Error | null = null;
    
    // Try the request with retries
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          body: JSON.stringify(data),
          ...options,
        });
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
        }
        
        return await response.json() as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error occurred');
        
        // Log the error
        console.error(`API request failed (${url}), attempt ${attempt + 1}/${retryCount + 1}:`, lastError);
        
        // If we haven't reached the max retry count, wait before trying again
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`Retrying request to ${url}...`);
        }
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to post to ${url} after ${retryCount} retries`);
  }
  
  /**
   * Make a PUT request with automatic retries
   * 
   * @param url The URL to put to
   * @param data The data to send in the request body
   * @param options Optional fetch options
   * @param retryOptions Options for retrying the request
   * @returns Promise resolving to the JSON response
   */
  static async put<T, D = any>(
    url: string,
    data: D,
    options?: RequestInit,
    retryOptions?: { retryCount?: number; retryDelay?: number }
  ): Promise<T> {
    const { retryCount = this.DEFAULT_RETRY_COUNT, retryDelay = this.DEFAULT_RETRY_DELAY } = retryOptions || {};
    let lastError: Error | null = null;
    
    // Try the request with retries
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          body: JSON.stringify(data),
          ...options,
        });
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
        }
        
        return await response.json() as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error occurred');
        
        // Log the error
        console.error(`API request failed (${url}), attempt ${attempt + 1}/${retryCount + 1}:`, lastError);
        
        // If we haven't reached the max retry count, wait before trying again
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`Retrying request to ${url}...`);
        }
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to put to ${url} after ${retryCount} retries`);
  }
  
  /**
   * Make a DELETE request with automatic retries
   * 
   * @param url The URL to delete from
   * @param options Optional fetch options
   * @param retryOptions Options for retrying the request
   * @returns Promise resolving to the JSON response
   */
  static async delete<T>(
    url: string,
    options?: RequestInit,
    retryOptions?: { retryCount?: number; retryDelay?: number }
  ): Promise<T> {
    const { retryCount = this.DEFAULT_RETRY_COUNT, retryDelay = this.DEFAULT_RETRY_DELAY } = retryOptions || {};
    let lastError: Error | null = null;
    
    // Try the request with retries
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          ...options,
        });
        
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
        }
        
        return await response.json() as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error occurred');
        
        // Log the error
        console.error(`API request failed (${url}), attempt ${attempt + 1}/${retryCount + 1}:`, lastError);
        
        // If we haven't reached the max retry count, wait before trying again
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          console.log(`Retrying request to ${url}...`);
        }
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError || new Error(`Failed to delete from ${url} after ${retryCount} retries`);
  }
}

export default ResilientApiService;