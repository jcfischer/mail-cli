/**
 * Tests for resilient fetch TypeScript types
 * Validates type constraints and structure
 */

import { describe, it, expect } from "bun:test";
import type {
  BatchTimeout,
  RetryPolicy,
  FetchError,
  SkipList,
  WatchdogState,
  ResilientFetchResult,
} from "../../src/imap/types";

describe("Resilient Fetch Types", () => {
  describe("BatchTimeout", () => {
    it("should accept valid timeout configuration", () => {
      const config: BatchTimeout = {
        timeoutMs: 120000,
        batchSize: 50,
      };
      expect(config.timeoutMs).toBe(120000);
      expect(config.batchSize).toBe(50);
    });
  });

  describe("RetryPolicy", () => {
    it("should accept valid retry configuration", () => {
      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoffSchedule: [1000, 2000, 4000],
        retryableErrors: ["ETIMEDOUT", "ECONNRESET", "EPIPE"],
      };
      expect(policy.maxAttempts).toBe(3);
      expect(policy.backoffSchedule).toHaveLength(3);
      expect(policy.retryableErrors).toContain("ETIMEDOUT");
    });
  });

  describe("FetchError", () => {
    it("should accept valid error record", () => {
      const error: FetchError = {
        timestamp: Date.now(),
        batchNumber: 5,
        uidRange: "1234-1283",
        errorType: "timeout",
        errorMessage: "Batch fetch exceeded 120s timeout",
        attemptNumber: 3,
      };
      expect(error.batchNumber).toBe(5);
      expect(error.errorType).toBe("timeout");
      expect(error.attemptNumber).toBe(3);
    });
  });

  describe("SkipList", () => {
    it("should accept valid skip list", () => {
      const skipList: SkipList = {
        uids: [1234, 5678, 9012],
        errors: [],
        outputPath: "/path/to/failed-uids.json",
      };
      expect(skipList.uids).toHaveLength(3);
      expect(skipList.errors).toHaveLength(0);
    });
  });

  describe("WatchdogState", () => {
    it("should accept valid watchdog state", () => {
      const state: WatchdogState = {
        lastUpdateTime: Date.now(),
        stallThresholdMs: 300000,
        timeoutMs: 600000,
        processedCount: 100,
      };
      expect(state.stallThresholdMs).toBe(300000);
      expect(state.timeoutMs).toBe(600000);
      expect(state.processedCount).toBe(100);
    });
  });

  describe("ResilientFetchResult", () => {
    it("should accept valid fetch result", () => {
      const result: ResilientFetchResult = {
        bodies: new Map([[1234, "email body"]]),
        errors: [],
        skipped: [],
        stats: {
          totalBatches: 10,
          successfulBatches: 9,
          retriedBatches: 1,
          failedBatches: 0,
          totalRetries: 2,
        },
      };
      expect(result.bodies.size).toBe(1);
      expect(result.stats.totalBatches).toBe(10);
      expect(result.stats.successfulBatches).toBe(9);
    });
  });
});
