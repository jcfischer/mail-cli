/**
 * Semaphore utility tests
 * TDD: RED phase - write tests first
 */

import { describe, it, expect } from "bun:test";
import { createSemaphore } from "../../src/utils/semaphore";

describe("createSemaphore", () => {
  describe("basic acquire/release", () => {
    it("should allow acquiring up to concurrency limit", async () => {
      const sem = createSemaphore(2);

      // First two should acquire immediately
      await sem.acquire();
      await sem.acquire();

      // Verify we can release
      sem.release();
      sem.release();
    });

    it("should return current count", async () => {
      const sem = createSemaphore(3);

      expect(sem.count()).toBe(0);
      await sem.acquire();
      expect(sem.count()).toBe(1);
      await sem.acquire();
      expect(sem.count()).toBe(2);
      sem.release();
      expect(sem.count()).toBe(1);
    });
  });

  describe("queuing when at capacity", () => {
    it("should queue when at capacity and process on release", async () => {
      const sem = createSemaphore(1);
      const order: number[] = [];

      // First acquire immediately
      await sem.acquire();
      order.push(1);

      // Second should queue
      const secondPromise = sem.acquire().then(() => {
        order.push(2);
      });

      // Give it a moment to ensure it's queued
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Release first, allowing second to proceed
      sem.release();
      await secondPromise;

      expect(order).toEqual([1, 2]);
    });

    it("should queue multiple waiters", async () => {
      const sem = createSemaphore(1);
      const order: number[] = [];

      await sem.acquire();

      // Queue up 3 more
      const p1 = sem.acquire().then(() => order.push(1));
      const p2 = sem.acquire().then(() => order.push(2));
      const p3 = sem.acquire().then(() => order.push(3));

      // Release them one by one
      sem.release();
      await p1;

      sem.release();
      await p2;

      sem.release();
      await p3;

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("FIFO ordering", () => {
    it("should process waiters in FIFO order", async () => {
      const sem = createSemaphore(1);
      const order: string[] = [];

      await sem.acquire();

      // Queue in specific order
      const pA = sem.acquire().then(() => order.push("A"));
      const pB = sem.acquire().then(() => order.push("B"));
      const pC = sem.acquire().then(() => order.push("C"));

      // Release all
      sem.release();
      await pA;
      sem.release();
      await pB;
      sem.release();
      await pC;

      // Should be FIFO
      expect(order).toEqual(["A", "B", "C"]);
    });
  });

  describe("concurrency limit", () => {
    it("should allow multiple concurrent up to limit", async () => {
      const sem = createSemaphore(3);
      let concurrent = 0;
      let maxConcurrent = 0;

      const task = async () => {
        await sem.acquire();
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrent--;
        sem.release();
      };

      // Run 5 tasks with concurrency limit of 3
      await Promise.all([task(), task(), task(), task(), task()]);

      expect(maxConcurrent).toBe(3);
    });
  });
});
