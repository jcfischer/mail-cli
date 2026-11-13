/**
 * Tests for resilient fetch utilities
 * Timeout wrapper, retry logic, and error handling
 */

import { describe, it, expect } from "bun:test";
import { withTimeout, retryWithBackoff, ProgressWatchdog, ResilientFetchOrchestrator } from "../../src/imap/resilient-fetch";
import type { ResilientFetchResult } from "../../src/imap/types";

describe("withTimeout", () => {
  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = await withTimeout(promise, 1000, new Error("Timeout"));
    expect(result).toBe("success");
  });

  it("should reject with timeout error when promise exceeds timeout", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 200));

    try {
      await withTimeout(promise, 50, new Error("Operation timed out"));
      throw new Error("Should have thrown timeout error");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Operation timed out");
    }
  });

  it("should reject with promise error if promise rejects before timeout", async () => {
    const promise = Promise.reject(new Error("Promise error"));

    try {
      await withTimeout(promise, 1000, new Error("Timeout"));
      throw new Error("Should have thrown promise error");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Promise error");
    }
  });

  it("should handle zero timeout", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 10));

    try {
      await withTimeout(promise, 0, new Error("Immediate timeout"));
      throw new Error("Should have thrown timeout error");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Immediate timeout");
    }
  });
});

describe("retryWithBackoff", () => {
  it("should succeed on first try without retrying", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      return "success";
    };

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffSchedule: [100, 200, 400],
      shouldRetry: () => true,
    });

    expect(result).toBe("success");
    expect(callCount).toBe(1);
  });

  it("should retry transient errors up to maxAttempts", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("ETIMEDOUT");
      }
      return "success after retries";
    };

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffSchedule: [10, 20, 40],
      shouldRetry: (error) => error.message === "ETIMEDOUT",
    });

    expect(result).toBe("success after retries");
    expect(callCount).toBe(3);
  });

  it("should fail fast on non-retryable errors", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error("AUTH_ERROR");
    };

    try {
      await retryWithBackoff(fn, {
        maxAttempts: 3,
        backoffSchedule: [10, 20, 40],
        shouldRetry: (error) => error.message === "ETIMEDOUT",
      });
      throw new Error("Should have thrown AUTH_ERROR");
    } catch (error) {
      expect((error as Error).message).toBe("AUTH_ERROR");
      expect(callCount).toBe(1); // No retries
    }
  });

  it("should call onRetry callback with correct parameters", async () => {
    let callCount = 0;
    const retryLog: Array<{ attempt: number; delayMs: number }> = [];

    const fn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("ETIMEDOUT");
      }
      return "success";
    };

    await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffSchedule: [100, 200, 400],
      shouldRetry: () => true,
      onRetry: (attempt, error, delayMs) => {
        retryLog.push({ attempt, delayMs });
      },
    });

    expect(retryLog).toHaveLength(2); // 2 retries (first call doesn't trigger onRetry)
    expect(retryLog[0]).toEqual({ attempt: 2, delayMs: 100 });
    expect(retryLog[1]).toEqual({ attempt: 3, delayMs: 200 });
  });

  it("should exhaust all retry attempts and throw final error", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new Error("PERSISTENT_ERROR");
    };

    try {
      await retryWithBackoff(fn, {
        maxAttempts: 3,
        backoffSchedule: [10, 20, 40],
        shouldRetry: () => true,
      });
      throw new Error("Should have thrown PERSISTENT_ERROR");
    } catch (error) {
      expect((error as Error).message).toBe("PERSISTENT_ERROR");
      expect(callCount).toBe(3); // All 3 attempts exhausted
    }
  });
});

describe("ResilientFetchOrchestrator", () => {
  describe("constructor", () => {
    it("should initialize with default options", () => {
      const mockClient = {} as any; // Mock ImapClient
      const orchestrator = new ResilientFetchOrchestrator(mockClient);

      // Should have default values
      expect(orchestrator).toBeDefined();
    });

    it("should accept custom options and override defaults", () => {
      const mockClient = {} as any;
      const customOptions = {
        timeoutMs: 60000,
        maxRetries: 5,
        skipErrors: false,
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, customOptions);

      expect(orchestrator).toBeDefined();
    });
  });

  describe("fetchBatch", () => {
    it("should successfully fetch batch within timeout", async () => {
      const mockBodies = new Map([[1, "body1"], [2, "body2"]]);
      const mockClient = {
        fetchBodiesByUid: async () => mockBodies,
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient);
      const result = await orchestrator.fetchBatch([1, 2], 1);

      expect(result).toEqual(mockBodies);
    });

    it("should throw timeout error when batch exceeds timeout", async () => {
      const mockClient = {
        fetchBodiesByUid: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate slow fetch
          return new Map();
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, { timeoutMs: 50 });

      try {
        await orchestrator.fetchBatch([1, 2], 1);
        throw new Error("Should have thrown timeout error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("Batch 1");
        expect((error as Error).message).toContain("timed out");
      }
    });

    it("should propagate fetch errors", async () => {
      const mockClient = {
        fetchBodiesByUid: async () => {
          throw new Error("IMAP connection failed");
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient);

      try {
        await orchestrator.fetchBatch([1, 2], 1);
        throw new Error("Should have thrown IMAP error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("IMAP connection failed");
      }
    });
  });

  describe("fetchBatchWithRetry", () => {
    it("should succeed on first try without retrying", async () => {
      let callCount = 0;
      const mockBodies = new Map([[1, "body1"]]);
      const mockClient = {
        fetchBodiesByUid: async () => {
          callCount++;
          return mockBodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient);
      const result = await orchestrator.fetchBatchWithRetry([1], 1);

      expect(result).toEqual(mockBodies);
      expect(callCount).toBe(1); // No retries needed
    });

    it("should retry transient errors and eventually succeed", async () => {
      let callCount = 0;
      const mockBodies = new Map([[1, "body1"]]);
      const mockClient = {
        fetchBodiesByUid: async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error("ETIMEDOUT"); // Retryable error
          }
          return mockBodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        maxRetries: 3,
      });
      const result = await orchestrator.fetchBatchWithRetry([1], 1);

      expect(result).toEqual(mockBodies);
      expect(callCount).toBe(3); // Retried twice
    });

    it("should fail fast on non-retryable errors", async () => {
      let callCount = 0;
      const mockClient = {
        fetchBodiesByUid: async () => {
          callCount++;
          throw new Error("Authentication failed"); // Non-retryable
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        maxRetries: 3,
      });

      try {
        await orchestrator.fetchBatchWithRetry([1], 1);
        throw new Error("Should have thrown auth error");
      } catch (error) {
        expect((error as Error).message).toBe("Authentication failed");
        expect(callCount).toBe(1); // No retries on auth error
      }
    });

    it("should exhaust retries and throw final error", async () => {
      let callCount = 0;
      const mockClient = {
        fetchBodiesByUid: async () => {
          callCount++;
          throw new Error("ECONNRESET"); // Retryable but persistent
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        maxRetries: 3,
      });

      try {
        await orchestrator.fetchBatchWithRetry([1], 1);
        throw new Error("Should have thrown after exhausting retries");
      } catch (error) {
        expect((error as Error).message).toBe("ECONNRESET");
        expect(callCount).toBe(3); // All 3 attempts used
      }
    });
  });

  describe("fetchWithResilience", () => {
    it("should successfully fetch all batches", async () => {
      const mockClient = {
        fetchBodiesByUid: async (uids: number[]) => {
          const bodies = new Map();
          for (const uid of uids) {
            bodies.set(uid, `body${uid}`);
          }
          return bodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient);
      const result = await orchestrator.fetchWithResilience([1, 2, 3, 4, 5], 2);

      expect(result.bodies.size).toBe(5);
      expect(result.bodies.get(1)).toBe("body1");
      expect(result.bodies.get(5)).toBe("body5");
      expect(result.errors).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.stats.totalBatches).toBe(3); // 5 UIDs / 2 per batch = 3 batches
      expect(result.stats.successfulBatches).toBe(3);
      expect(result.stats.failedBatches).toBe(0);
    });

    it("should skip failed batches in skip-errors mode (default)", async () => {
      let batchCount = 0;
      const mockClient = {
        fetchBodiesByUid: async (uids: number[]) => {
          batchCount++;
          if (batchCount === 2) {
            throw new Error("ECONNRESET"); // Second batch fails
          }
          const bodies = new Map();
          for (const uid of uids) {
            bodies.set(uid, `body${uid}`);
          }
          return bodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        skipErrors: true,
        maxRetries: 1, // Fail quickly for test speed
      });
      const result = await orchestrator.fetchWithResilience([1, 2, 3, 4], 2);

      // Batch 1: [1, 2] - success
      // Batch 2: [3, 4] - failed after retries, skipped
      expect(result.bodies.size).toBe(2); // Only batch 1 succeeded
      expect(result.bodies.get(1)).toBe("body1");
      expect(result.bodies.get(2)).toBe("body2");
      expect(result.errors).toHaveLength(1); // One batch failed
      expect(result.errors[0].errorMessage).toBe("ECONNRESET");
      expect(result.errors[0].batchNumber).toBe(2);
      expect(result.skipped).toEqual([3, 4]); // Batch 2 UIDs skipped
      expect(result.stats.totalBatches).toBe(2);
      expect(result.stats.successfulBatches).toBe(1);
      expect(result.stats.failedBatches).toBe(1);
    });

    it("should fail fast when skipErrors=false", async () => {
      let batchCount = 0;
      const mockClient = {
        fetchBodiesByUid: async (uids: number[]) => {
          batchCount++;
          if (batchCount === 2) {
            throw new Error("ECONNRESET"); // Second batch fails
          }
          const bodies = new Map();
          for (const uid of uids) {
            bodies.set(uid, `body${uid}`);
          }
          return bodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        skipErrors: false, // Fail fast mode
        maxRetries: 1,
      });

      try {
        await orchestrator.fetchWithResilience([1, 2, 3, 4], 2);
        throw new Error("Should have thrown on first batch failure");
      } catch (error) {
        expect((error as Error).message).toBe("ECONNRESET");
      }
    });

    it("should track retry stats correctly", async () => {
      let batchCount = 0;
      let attemptCount = 0;
      const mockClient = {
        fetchBodiesByUid: async (uids: number[]) => {
          batchCount++;
          attemptCount++;

          // First batch: fails once, then succeeds
          if (batchCount === 1 && attemptCount === 1) {
            throw new Error("ETIMEDOUT");
          }

          const bodies = new Map();
          for (const uid of uids) {
            bodies.set(uid, `body${uid}`);
          }
          return bodies;
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        maxRetries: 2,
      });
      const result = await orchestrator.fetchWithResilience([1, 2], 2);

      expect(result.bodies.size).toBe(2);
      expect(result.stats.retriedBatches).toBe(1); // Batch 1 was retried
      expect(result.stats.totalRetries).toBe(1); // One retry attempt
      expect(result.stats.successfulBatches).toBe(1);
      expect(result.stats.failedBatches).toBe(0);
    });

    it("should classify errors correctly in error records", async () => {
      const mockClient = {
        fetchBodiesByUid: async () => {
          throw new Error("Operation timed out");
        },
      };

      const orchestrator = new ResilientFetchOrchestrator(mockClient, {
        skipErrors: true,
        maxRetries: 1,
      });
      const result = await orchestrator.fetchWithResilience([1, 2], 2);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe("timeout");
      expect(result.errors[0].errorMessage).toContain("timed out");
      expect(result.errors[0].uidRange).toBe("1-2");
    });
  });
});

describe("ProgressWatchdog", () => {
  it("should start without warnings when regularly updated", async () => {
    let stallWarning = false;
    let timeoutWarning = false;

    const watchdog = new ProgressWatchdog({
      stallThresholdMs: 100,
      timeoutMs: 200,
      checkIntervalMs: 20, // Check every 20ms for fast tests
      onStall: () => { stallWarning = true; },
      onTimeout: () => { timeoutWarning = true; },
    });

    watchdog.start();

    // Update progress every 50ms (before stall threshold)
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      watchdog.update(i * 10);
    }

    watchdog.stop();

    expect(stallWarning).toBe(false);
    expect(timeoutWarning).toBe(false);
  });

  it("should trigger stall warning when no updates for stallThresholdMs", async () => {
    let stallWarning = false;

    const watchdog = new ProgressWatchdog({
      stallThresholdMs: 50,
      timeoutMs: 500,
      checkIntervalMs: 20, // Check every 20ms
      onStall: () => { stallWarning = true; },
    });

    watchdog.start();

    // Wait longer than stall threshold without updating
    await new Promise((resolve) => setTimeout(resolve, 100));

    watchdog.stop();

    expect(stallWarning).toBe(true);
  });

  it("should trigger timeout when no updates for timeoutMs", async () => {
    let timeoutWarning = false;

    const watchdog = new ProgressWatchdog({
      stallThresholdMs: 50,
      timeoutMs: 100,
      checkIntervalMs: 20, // Check every 20ms
      onTimeout: () => { timeoutWarning = true; },
    });

    watchdog.start();

    // Wait longer than timeout without updating
    await new Promise((resolve) => setTimeout(resolve, 150));

    watchdog.stop();

    expect(timeoutWarning).toBe(true);
  });

  it("should stop checking when stop() is called", async () => {
    let stallWarning = false;

    const watchdog = new ProgressWatchdog({
      stallThresholdMs: 50,
      timeoutMs: 100,
      checkIntervalMs: 20, // Check every 20ms
      onStall: () => { stallWarning = true; },
    });

    watchdog.start();
    watchdog.stop(); // Stop immediately

    // Wait past stall threshold
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should not trigger because we stopped
    expect(stallWarning).toBe(false);
  });
});
