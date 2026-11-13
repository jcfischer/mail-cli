/**
 * IMAP Error Classification
 *
 * Determines which errors are retryable (transient network issues) vs
 * permanent errors (auth failures, invalid operations).
 */

/**
 * Error type categories
 */
export type ErrorType = "timeout" | "network" | "auth" | "parse" | "unknown";

/**
 * Retryable error codes (transient network issues)
 */
const RETRYABLE_ERROR_CODES = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
];

/**
 * Check if an error is retryable (transient) or permanent
 *
 * Transient errors (network issues, timeouts) should be retried.
 * Permanent errors (auth failures, invalid operations) should fail immediately.
 *
 * @param error - Error to classify
 * @returns true if error is retryable (transient), false if permanent
 *
 * @example
 * if (isRetryableError(error)) {
 *   await retryOperation();
 * } else {
 *   throw error; // Fail fast on permanent errors
 * }
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toUpperCase();

  // Check for retryable error codes
  for (const code of RETRYABLE_ERROR_CODES) {
    if (message.includes(code)) {
      return true;
    }
  }

  // Check for common retryable error messages
  if (
    message.includes("TIMEOUT") ||
    message.includes("NETWORK") ||
    message.includes("CONNECTION") ||
    message.includes("REFUSED") ||
    message.includes("RESET")
  ) {
    return true;
  }

  // Check for permanent errors (auth, invalid operations)
  if (
    message.includes("AUTH") ||
    message.includes("CREDENTIAL") ||
    message.includes("PERMISSION") ||
    message.includes("FORBIDDEN")
  ) {
    return false;
  }

  // Default: treat unknown errors as retryable (conservative approach)
  return true;
}

/**
 * Classify error into specific type category
 *
 * Used for logging and analytics to understand error patterns.
 *
 * @param error - Error to classify
 * @returns Error type category
 *
 * @example
 * const errorType = classifyError(error);
 * logger.error(`Batch failed with ${errorType} error: ${error.message}`);
 */
export function classifyError(error: Error): ErrorType {
  const message = error.message.toUpperCase();

  // Timeout errors
  if (message.includes("TIMEOUT") || message.includes("ETIMEDOUT") || message.includes("TIMED OUT")) {
    return "timeout";
  }

  // Network errors
  if (
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("EPIPE") ||
    message.includes("NETWORK") ||
    message.includes("CONNECTION")
  ) {
    return "network";
  }

  // Auth errors
  if (
    message.includes("AUTH") ||
    message.includes("CREDENTIAL") ||
    message.includes("PERMISSION") ||
    message.includes("FORBIDDEN")
  ) {
    return "auth";
  }

  // Parse errors
  if (message.includes("PARSE") || message.includes("INVALID")) {
    return "parse";
  }

  // Unknown
  return "unknown";
}
