import { describe, it, expect } from 'bun:test';
import { MessageUID, isMessageUID, UID_OPTIONS } from '../../src/imap/types';

describe('MessageUID branded type', () => {
  describe('MessageUID constructor', () => {
    it('should create MessageUID from valid positive integer', () => {
      const uid = MessageUID(12345);
      expect(uid).toBe(12345);
    });

    it('should preserve numeric value', () => {
      const uid = MessageUID(999);
      const raw: number = uid; // Should be assignable to number
      expect(raw).toBe(999);
    });

    it('should throw on zero', () => {
      expect(() => MessageUID(0)).toThrow('Invalid UID: 0. Must be positive integer.');
    });

    it('should throw on negative number', () => {
      expect(() => MessageUID(-5)).toThrow('Invalid UID: -5. Must be positive integer.');
    });

    it('should throw on non-integer (float)', () => {
      expect(() => MessageUID(12.5)).toThrow('Invalid UID: 12.5. Must be positive integer.');
    });

    it('should throw on NaN', () => {
      expect(() => MessageUID(NaN)).toThrow('Invalid UID: NaN. Must be positive integer.');
    });

    it('should throw on Infinity', () => {
      expect(() => MessageUID(Infinity)).toThrow('Invalid UID: Infinity. Must be positive integer.');
    });

    it('should accept large valid UIDs', () => {
      const largeUid = MessageUID(2147483647); // Max 32-bit signed int
      expect(largeUid).toBe(2147483647);
    });
  });

  describe('isMessageUID type guard', () => {
    it('should return true for valid positive integer', () => {
      expect(isMessageUID(12345)).toBe(true);
    });

    it('should return true for 1 (minimum valid UID)', () => {
      expect(isMessageUID(1)).toBe(true);
    });

    it('should return false for zero', () => {
      expect(isMessageUID(0)).toBe(false);
    });

    it('should return false for negative number', () => {
      expect(isMessageUID(-5)).toBe(false);
    });

    it('should return false for float', () => {
      expect(isMessageUID(12.5)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isMessageUID('12345')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isMessageUID(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isMessageUID(undefined)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isMessageUID({ value: 12345 })).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isMessageUID(NaN)).toBe(false);
    });
  });

  describe('UID_OPTIONS constant', () => {
    it('should have uid: true property', () => {
      expect(UID_OPTIONS.uid).toBe(true);
    });

    it('should be readonly (frozen)', () => {
      expect(Object.isFrozen(UID_OPTIONS)).toBe(true);
    });
  });
});
