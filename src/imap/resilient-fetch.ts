/**
 * Resilient IMAP Fetch Utilities
 *
 * Timeout enforcement, retry logic, error recovery, and progress monitoring
 * for IMAP batch fetch operations.
 */

import { isRetryableError, classifyError } from "./error-classifier";
import type { ResilientFetchResult, FetchError } from "./types";

/**
 * Wrap a promise with a timeout
 *
 * Uses Promise.race to enforce a maximum execution time. If the promise
 * doesn't resolve/reject within timeoutMs, the timeout error is thrown.
 *
 * @param promise - Promise to wrap with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutError - Error to throw on timeout
 * @returns Promise result if completed within timeout
 * @throws timeoutError if promise exceeds timeout
 *
 * @example
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   new Error("Fetch timed out after 5s")
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error
): Promise<T> {
  // Create timeout promise that rejects after timeoutMs
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(timeoutError), timeoutMs);
  });

  // Race between the original promise and timeout
  return Promise.race([promise, timeout]);
}

/**
 * Retry options for retryWithBackoff
 */
export interface RetryOptions {
  maxAttempts: number;                                      // Maximum number of attempts (including first try)
  backoffSchedule: number[];                                // Delay in ms for each retry [1st retry, 2nd retry, ...]
  shouldRetry: (error: Error) => boolean;                   // Predicate to determine if error is retryable
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;  // Optional callback before each retry
}

/**
 * Retry a function with exponential backoff
 *
 * Attempts to execute the function up to maxAttempts times. On failure, checks
 * if the error is retryable using shouldRetry predicate. If retryable, waits
 * for the delay specified in backoffSchedule before retrying.
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of fn on success
 * @throws Last error if all attempts fail
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetchFromServer(),
 *   {
 *     maxAttempts: 3,
 *     backoffSchedule: [1000, 2000, 4000],
 *     shouldRetry: (error) => error.message.includes("ETIMEDOUT"),
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, backoffSchedule, shouldRetry, onRetry } = options;
  let lastError: Error = new Error("No attempts made");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt, throw the error
      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Check if error is retryable
      if (!shouldRetry(lastError)) {
        throw lastError; // Fail fast on non-retryable errors
      }

      // Calculate delay for this retry (attempt-1 because first attempt is index 0)
      const delayMs = backoffSchedule[attempt - 1] || backoffSchedule[backoffSchedule.length - 1];

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError, delayMs); // attempt+1 because we're about to retry
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Progress Watchdog Options
 */
export interface ProgressWatchdogOptions {
  stallThresholdMs?: number;   // Warn if no progress for this long (default: 300000 = 5min)
  timeoutMs?: number;          // Exit if no progress for this long (default: 600000 = 10min)
  checkIntervalMs?: number;    // How often to check progress (default: 10000 = 10s)
  onStall?: () => void;        // Callback when progress stalls
  onTimeout?: () => void;      // Callback when timeout is reached
}

/**
 * Resilient Fetch Orchestrator Options
 */
export interface ResilientFetchOptions {
  timeoutMs?: number;       // Timeout per batch in ms (default: 120000 = 120s)
  maxRetries?: number;      // Maximum retry attempts (default: 3)
  skipErrors?: boolean;     // Skip failed batches instead of exiting (default: true)
}

/**
 * Resilient Fetch Orchestrator
 *
 * Wraps ImapClient.fetchBodiesByUid() with timeout enforcement, retry logic,
 * error recovery, and detailed logging.
 *
 * @example
 * const orchestrator = new ResilientFetchOrchestrator(imapClient, {
 *   timeoutMs: 120000,
 *   maxRetries: 3,
 *   skipErrors: true
 * });
 *
 * const result = await orchestrator.fetchWithResilience(uids);
 */
export class ResilientFetchOrchestrator {
  private client: any; // ImapClient type (avoid circular dependency)
  private timeoutMs: number;
  private maxRetries: number;
  private skipErrors: boolean;

  constructor(client: any, options: ResilientFetchOptions = {}) {
    this.client = client;
    this.timeoutMs = options.timeoutMs ?? 120000;      // 120 seconds default
    this.maxRetries = options.maxRetries ?? 3;         // 3 attempts default
    this.skipErrors = options.skipErrors ?? true;      // Skip errors by default (opt-out)
  }

  /**
   * Fetch a single batch with timeout enforcement
   *
   * Wraps ImapClient.fetchBodiesByUid() with timeout using withTimeout() utility.
   * If the fetch exceeds timeoutMs, throws a descriptive timeout error.
   *
   * @param uids - UIDs to fetch in this batch
   * @param batchNumber - Batch number (for error messages)
   * @returns Map of UID -> body text
   * @throws Error if timeout or IMAP error occurs
   */
  async fetchBatch(uids: number[], batchNumber: number): Promise<Map<number, string>> {
    const uidRange = uids.length > 0 ? `${uids[0]}-${uids[uids.length - 1]}` : "empty";
    const timeoutError = new Error(
      `Batch ${batchNumber} (UIDs ${uidRange}) timed out after ${this.timeoutMs}ms`
    );

    return withTimeout(
      this.client.fetchBodiesByUid(uids),
      this.timeoutMs,
      timeoutError
    );
  }

  /**
   * Fetch a single batch with retry logic
   *
   * Wraps fetchBatch() with retryWithBackoff(). Retries transient errors
   * (network issues, timeouts) but fails fast on permanent errors (auth failures).
   *
   * @param uids - UIDs to fetch in this batch
   * @param batchNumber - Batch number (for error messages)
   * @returns Map of UID -> body text
   * @throws Error if all retries exhausted or non-retryable error occurs
   */
  async fetchBatchWithRetry(uids: number[], batchNumber: number): Promise<Map<number, string>> {
    return retryWithBackoff(
      () => this.fetchBatch(uids, batchNumber),
      {
        maxAttempts: this.maxRetries,
        backoffSchedule: [1000, 2000, 4000], // 1s, 2s, 4s exponential backoff
        shouldRetry: (error) => isRetryableError(error),
      }
    );
  }

  /**
   * Fetch multiple UIDs with full resilience orchestration
   *
   * Main entry point that orchestrates batch fetching with:
   * - Batch splitting
   * - Timeout enforcement (per batch)
   * - Retry logic (transient errors only)
   * - Error recovery (skip-errors mode or fail-fast)
   * - Detailed error logging and stats
   *
   * @param uids - All UIDs to fetch
   * @param batchSize - Number of UIDs per batch (default: 50)
   * @returns ResilientFetchResult with bodies, errors, skipped UIDs, and stats
   * @throws Error if skipErrors=false and any batch fails
   *
   * @example
   * const result = await orchestrator.fetchWithResilience([1, 2, 3, 4, 5], 2);
   * console.log(`Fetched ${result.bodies.size} emails`);
   * console.log(`Failed batches: ${result.stats.failedBatches}`);
   */
  async fetchWithResilience(uids: number[], batchSize: number = 50): Promise<ResilientFetchResult> {
    const bodies = new Map<number, string>();
    const errors: FetchError[] = [];
    const skipped: number[] = [];
    const stats = {
      totalBatches: 0,
      successfulBatches: 0,
      retriedBatches: 0,
      failedBatches: 0,
      totalRetries: 0,
    };

    // Split UIDs into batches
    const batches: number[][] = [];
    for (let i = 0; i < uids.length; i += batchSize) {
      batches.push(uids.slice(i, i + batchSize));
    }
    stats.totalBatches = batches.length;

    // Process each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = i + 1;
      let retryOccurred = false;

      try {
        // Track if retry occurred by wrapping fetchBatchWithRetry
        const result = await retryWithBackoff(
          () => this.fetchBatch(batch, batchNumber),
          {
            maxAttempts: this.maxRetries,
            backoffSchedule: [1000, 2000, 4000],
            shouldRetry: (error) => isRetryableError(error),
            onRetry: (attempt, error, delayMs) => {
              retryOccurred = true;
              stats.totalRetries++;
            },
          }
        );

        // Success - add bodies to result
        for (const [uid, body] of result.entries()) {
          bodies.set(uid, body);
        }
        stats.successfulBatches++;
        if (retryOccurred) {
          stats.retriedBatches++;
        }
      } catch (error) {
        // Batch failed after all retries
        stats.failedBatches++;

        const err = error instanceof Error ? error : new Error(String(error));
        const uidRange = batch.length > 0 ? `${batch[0]}-${batch[batch.length - 1]}` : "empty";
        const fetchError: FetchError = {
          timestamp: Date.now(),
          batchNumber,
          uidRange,
          errorType: classifyError(err),
          errorMessage: err.message,
          attemptNumber: this.maxRetries, // All attempts exhausted
        };

        errors.push(fetchError);
        skipped.push(...batch);

        // Fail fast if skipErrors=false
        if (!this.skipErrors) {
          throw err;
        }
      }
    }

    return {
      bodies,
      errors,
      skipped,
      stats,
    };
  }
}

/**
 * Progress Watchdog
 *
 * Monitors progress and detects when operations have stalled or timed out.
 * Useful for detecting hung IMAP connections or infinite loops.
 *
 * @example
 * const watchdog = new ProgressWatchdog({
 *   stallThresholdMs: 300000,  // 5 minutes
 *   timeoutMs: 600000,         // 10 minutes
 *   onStall: () => console.warn("Progress stalled!"),
 *   onTimeout: () => { throw new Error("Operation timed out"); }
 * });
 *
 * watchdog.start();
 * for (const item of items) {
 *   await processItem(item);
 *   watchdog.update(++processedCount);
 * }
 * watchdog.stop();
 */
export class ProgressWatchdog {
  private lastUpdateTime: number = Date.now();
  private stallThresholdMs: number;
  private timeoutMs: number;
  private checkIntervalMs: number;
  private processedCount: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private onStall?: () => void;
  private onTimeout?: () => void;
  private stallWarningIssued: boolean = false;

  constructor(options: ProgressWatchdogOptions = {}) {
    this.stallThresholdMs = options.stallThresholdMs || 300000; // 5 minutes default
    this.timeoutMs = options.timeoutMs || 600000;               // 10 minutes default
    this.checkIntervalMs = options.checkIntervalMs || 10000;    // 10 seconds default
    this.onStall = options.onStall;
    this.onTimeout = options.onTimeout;
  }

  /**
   * Update watchdog with current progress
   * Resets the stall timer
   *
   * @param processedCount - Number of items processed so far
   */
  update(processedCount: number): void {
    this.lastUpdateTime = Date.now();
    this.processedCount = processedCount;
    this.stallWarningIssued = false; // Reset warning flag on progress
  }

  /**
   * Start monitoring progress
   * Checks for stalls/timeouts at configured interval
   */
  start(): void {
    if (this.timer) {
      return; // Already started
    }

    this.lastUpdateTime = Date.now();

    // Check for stalls at configured interval
    this.timer = setInterval(() => {
      this.checkProgress();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring progress
   * Clears the timer
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if progress has stalled or timed out
   */
  private checkProgress(): void {
    const timeSinceLastUpdate = Date.now() - this.lastUpdateTime;

    // Check for timeout (fatal)
    if (timeSinceLastUpdate >= this.timeoutMs) {
      this.stop(); // Stop monitoring
      if (this.onTimeout) {
        this.onTimeout();
      }
      return;
    }

    // Check for stall (warning)
    if (timeSinceLastUpdate >= this.stallThresholdMs && !this.stallWarningIssued) {
      this.stallWarningIssued = true;
      if (this.onStall) {
        this.onStall();
      }
    }
  }
}
