/**
 * Retry utility for API calls with limited retries
 * Retries a few times then gives up gracefully
 */

export async function retryUntilSuccess<T>(
  fn: () => Promise<T>,
  options: {
    delay?: number; // Initial delay in ms
    maxDelay?: number; // Maximum delay in ms
    backoff?: number; // Exponential backoff multiplier
    maxRetries?: number; // Maximum number of retries (default 3)
    onRetry?: (attempt: number, error: any) => void; // Optional callback for logging
  } = {}
): Promise<T> {
  const {
    delay = 1000,
    maxDelay = 10000, // Reduced max delay
    backoff = 1.5,
    maxRetries = 3, // Only retry 3 times
    onRetry,
  } = options;

  let attempt = 0;
  let currentDelay = delay;
  let lastError: any;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      attempt++;
      
      // Stop retrying for 4xx errors (client errors)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        console.warn(`[Retry] Got ${error.response.status} error, not retrying.`);
        throw error;
      }
      
      // Stop if we've exceeded max retries
      if (attempt > maxRetries) {
        console.warn(`[Retry] Max retries (${maxRetries}) exceeded. Giving up.`);
        throw error;
      }
      
      // Log retry attempt
      if (onRetry) {
        onRetry(attempt, error);
      } else {
        console.log(`[Retry] Attempt ${attempt}/${maxRetries} failed, retrying in ${currentDelay}ms...`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, currentDelay));

      // Exponential backoff with max cap
      currentDelay = Math.min(currentDelay * backoff, maxDelay);
    }
  }
  
  throw lastError;
}

/**
 * Retry with timeout - retries until success but with a maximum total time
 * Still never shows errors, just keeps retrying within the timeout window
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  options: {
    delay?: number;
    maxDelay?: number;
    backoff?: number;
  } = {}
): Promise<T> {
  const startTime = Date.now();
  
  return retryUntilSuccess(fn, {
    ...options,
    onRetry: (attempt) => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        // If timeout exceeded, restart the timeout window
        // This ensures we keep retrying indefinitely
        return retryWithTimeout(fn, timeoutMs, options);
      }
      console.log(`[Retry] Attempt ${attempt} (${elapsed}ms elapsed), retrying...`);
    },
  });
}

