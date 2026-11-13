/**
 * IMAP UID Type Safety
 *
 * Branded type for IMAP Message UIDs to prevent compile-time confusion
 * between UIDs and sequence numbers. ImapFlow defaults to sequence numbers,
 * so this module ensures all operations explicitly use UID mode.
 */

/**
 * Branded type for IMAP Message UIDs
 *
 * This type is structurally equivalent to `number` at runtime, but
 * TypeScript treats it as distinct, preventing accidental misuse
 * of sequence numbers where UIDs are expected.
 *
 * @example
 * const uid = MessageUID(12345);  // Create from number
 * const raw: number = uid;        // Assignable to number
 * someFunction(uid);              // Type-safe parameter passing
 */
export type MessageUID = number & { readonly __brand: 'MessageUID' };

/**
 * Create a MessageUID from a number
 *
 * @param value - Raw UID number from IMAP
 * @returns Branded MessageUID type
 * @throws Error if value is not a positive integer
 *
 * @example
 * const uid = MessageUID(12345);
 * await client.deleteMessage(uid);
 */
export function MessageUID(value: number): MessageUID {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid UID: ${value}. Must be positive integer.`);
  }
  return value as MessageUID;
}

/**
 * Type guard to check if a value is a valid MessageUID
 *
 * @param value - Unknown value to check
 * @returns true if value could be a valid MessageUID
 *
 * @example
 * if (isMessageUID(maybeUid)) {
 *   await client.deleteMessage(maybeUid);
 * }
 */
export function isMessageUID(value: unknown): value is MessageUID {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * UID-safe operation options
 *
 * Centralizes { uid: true } to single location. All IMAP operations
 * that work with message identifiers should use this constant.
 *
 * @example
 * await this.client.messageFlagsAdd(String(uid), flags, UID_OPTIONS);
 */
export const UID_OPTIONS = Object.freeze({ uid: true }) as Readonly<{ uid: true }>;

/**
 * Resilient IMAP Fetch Types
 *
 * Types for timeout enforcement, retry logic, error recovery, and progress monitoring
 * during batch IMAP fetch operations.
 */

/**
 * Timeout configuration for batch operations
 */
export interface BatchTimeout {
  timeoutMs: number;    // Timeout in milliseconds (default: 120000 = 120 seconds)
  batchSize: number;    // Number of messages per batch (default: 50)
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;        // Maximum retry attempts (default: 3)
  backoffSchedule: number[];  // Backoff delays in ms (default: [1000, 2000, 4000])
  retryableErrors: string[];  // Error codes that trigger retry (e.g., ETIMEDOUT, ECONNRESET)
}

/**
 * Detailed error record for failed fetch operations
 */
export interface FetchError {
  timestamp: number;      // Unix timestamp when error occurred
  batchNumber: number;    // Which batch failed (1-indexed)
  uidRange: string;       // UID range of failed batch (e.g., "1234-1283")
  errorType: string;      // Error category: "timeout" | "network" | "parse" | "auth"
  errorMessage: string;   // Full error message
  attemptNumber: number;  // Which retry attempt (1 = first try, 2 = first retry, etc.)
}

/**
 * List of UIDs that failed to fetch
 */
export interface SkipList {
  uids: number[];          // UIDs that failed
  errors: FetchError[];    // Detailed error records
  outputPath: string;      // File path where skip list was saved
}

/**
 * Progress watchdog state for detecting stalled operations
 */
export interface WatchdogState {
  lastUpdateTime: number;   // Unix timestamp of last progress update
  stallThresholdMs: number; // Warn if no progress for this long (default: 300000 = 5min)
  timeoutMs: number;        // Exit if no progress for this long (default: 600000 = 10min)
  processedCount: number;   // Total messages processed so far
}

/**
 * Result of resilient fetch operation
 */
export interface ResilientFetchResult {
  bodies: Map<number, string>;  // Successful fetches (UID -> body text)
  errors: FetchError[];          // All errors encountered
  skipped: number[];             // UIDs that were skipped
  stats: {
    totalBatches: number;        // Total batches attempted
    successfulBatches: number;   // Batches that completed successfully
    retriedBatches: number;      // Batches that required retries
    failedBatches: number;       // Batches that failed after all retries
    totalRetries: number;        // Total number of retry attempts
  };
}
