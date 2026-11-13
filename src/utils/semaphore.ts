/**
 * Simple Semaphore for concurrency control
 *
 * Used to limit parallel LLM calls during snippet generation.
 */

export interface Semaphore {
  /** Acquire a slot. Resolves immediately if available, otherwise queues. */
  acquire(): Promise<void>;
  /** Release a slot, allowing next queued waiter to proceed. */
  release(): void;
  /** Get current number of active slots. */
  count(): number;
}

/**
 * Create a semaphore with the specified concurrency limit
 *
 * @param concurrency Maximum number of concurrent operations
 * @returns Semaphore with acquire/release/count methods
 *
 * @example
 * const sem = createSemaphore(5);
 * await sem.acquire();
 * try {
 *   // do work
 * } finally {
 *   sem.release();
 * }
 */
export function createSemaphore(concurrency: number): Semaphore {
  let running = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (running < concurrency) {
        running++;
        return;
      }
      // At capacity - queue this request
      await new Promise<void>((resolve) => queue.push(resolve));
      running++;
    },

    release(): void {
      running--;
      const next = queue.shift();
      if (next) {
        next();
      }
    },

    count(): number {
      return running;
    },
  };
}
