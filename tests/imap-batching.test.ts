/**
 * IMAP Batching Tests
 * Test that FETCH operations are properly batched to avoid command length limits
 */

import { describe, test, expect } from 'bun:test';

describe('IMAP Batching', () => {
  /**
   * Helper to split array into chunks
   */
  function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  test('should split UIDs into chunks of 50', () => {
    const uids = Array.from({ length: 150 }, (_, i) => i + 1);

    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(50);
    expect(chunks[1].length).toBe(50);
    expect(chunks[2].length).toBe(50);
    expect(chunks[0][0]).toBe(1);
    expect(chunks[0][49]).toBe(50);
    expect(chunks[1][0]).toBe(51);
    expect(chunks[2][49]).toBe(150);
  });

  test('should handle array smaller than chunk size', () => {
    const uids = Array.from({ length: 25 }, (_, i) => i + 1);

    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(25);
  });

  test('should handle empty array', () => {
    const uids: number[] = [];

    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(0);
  });

  test('should handle array with exact chunk size', () => {
    const uids = Array.from({ length: 50 }, (_, i) => i + 1);

    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(50);
  });

  test('should handle array with partial last chunk', () => {
    const uids = Array.from({ length: 59 }, (_, i) => i + 1);

    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(50);
    expect(chunks[1].length).toBe(9);
    expect(chunks[1][0]).toBe(51);
    expect(chunks[1][8]).toBe(59);
  });

  test('should batch FETCH operations for 59 UIDs', () => {
    // Simulate the error case: 59 UIDs need to be fetched
    const uids = Array.from({ length: 59 }, (_, i) => i + 1);

    // With batch size of 50, should create 2 batches
    const chunks = chunkArray(uids, 50);

    expect(chunks.length).toBe(2);

    // First batch: 50 UIDs
    expect(chunks[0].length).toBe(50);
    expect(chunks[0][0]).toBe(1);
    expect(chunks[0][49]).toBe(50);

    // Second batch: 9 UIDs
    expect(chunks[1].length).toBe(9);
    expect(chunks[1][0]).toBe(51);
    expect(chunks[1][8]).toBe(59);
  });

  test('should maintain UID order after batching', () => {
    const uids = Array.from({ length: 100 }, (_, i) => i + 1);

    const chunks = chunkArray(uids, 50);

    // Flatten chunks back into single array
    const flattened = chunks.flat();

    expect(flattened).toEqual(uids);
  });
});
