/**
 * Enhanced fetch utility with retry logic, timeouts, and error handling
 */

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Fetch with retry logic and proper error handling
 * @param url The URL to fetch
 * @param options Fetch options with additional retry configuration
 * @returns Response from the fetch operation
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const {
    timeout = 10000, // 10 second timeout by default
    retries = 3,     // Retry 3 times by default
    retryDelay = 1000, // 1 second delay between retries
    ...fetchOptions
  } = options;

  // Add timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // Merge signal with existing options
  const signal = controller.signal;
  const mergedOptions = {
    ...fetchOptions,
    signal
  };

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < retries) {
    try {
      attempt++;
      
      const response = await fetch(url, mergedOptions);
      
      // Clear the timeout since fetch completed
      clearTimeout(timeoutId);
      
      // Check if the response is ok (status in the range 200-299)
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      // Don't retry if we've been explicitly aborted or if we're out of retries
      if (error.name === 'AbortError' || attempt >= retries) {
        break;
      }
      
      // Clear the existing timeout and create a new one for the next attempt
      clearTimeout(timeoutId);
      
      // Log the retry attempt
      console.warn(`Fetch attempt ${attempt} failed for ${url}. Retrying in ${retryDelay}ms...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // If we've exhausted all retries, throw the last error
  if (lastError) {
    console.error(`All ${retries} fetch attempts failed for ${url}:`, lastError);
    throw lastError;
  }

  // This should never happen, but TypeScript needs it
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

/**
 * Fetch JSON data with retry logic
 */
export async function fetchJsonWithRetry<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return await response.json() as T;
}

export default fetchWithRetry; 