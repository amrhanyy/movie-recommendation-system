/**
 * Enhanced fetch utility with retry logic, timeouts, and error handling
 */

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Build a log-safe URL (M-02): keep origin + pathname, drop the query string.
 * Query strings carry credentials (e.g. TMDB `api_key=...`) and must never
 * reach stdout/stderr.
 */
export function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Not a valid absolute URL — never echo the raw value.
    return '[invalid-url]';
  }
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
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if we've been explicitly aborted or if we're out of retries
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        attempt >= retries
      ) {
        break;
      }
      
      // Clear the existing timeout and create a new one for the next attempt
      clearTimeout(timeoutId);
      
      // Log the retry attempt (M-02: never log the full URL — it carries api_key)
      console.warn(`Fetch attempt ${attempt} failed for ${redactUrlForLog(url)}. Retrying in ${retryDelay}ms...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // If we've exhausted all retries, throw the last error
  if (lastError) {
    console.error(`All ${retries} fetch attempts failed for ${redactUrlForLog(url)}:`, lastError);
    throw lastError;
  }

  // This should never happen, but TypeScript needs it
  throw new Error(`Failed to fetch ${redactUrlForLog(url)} after ${retries} attempts`);
}

/**
 * Fetch JSON data with retry logic
 */
export async function fetchJsonWithRetry<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, options);
  return await response.json() as T;
}

export default fetchWithRetry; 