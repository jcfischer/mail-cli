/**
 * TDD Tests: Clean Inbox Input Handling
 * T-3.2: Parse user input into actions
 */

import { describe, it, expect } from 'bun:test';
import {
  parseActionKey,
  isValidActionKey,
  ACTION_KEYS,
} from '../../src/clean/input';

describe('ACTION_KEYS', () => {
  it('should define all action keys', () => {
    expect(ACTION_KEYS).toHaveProperty('d');
    expect(ACTION_KEYS).toHaveProperty('a');
    expect(ACTION_KEYS).toHaveProperty('r');
    expect(ACTION_KEYS).toHaveProperty('t');
    expect(ACTION_KEYS).toHaveProperty('s');
    expect(ACTION_KEYS).toHaveProperty('q');
  });

  it('should map keys to action types', () => {
    expect(ACTION_KEYS.d).toBe('delete');
    expect(ACTION_KEYS.a).toBe('archive');
    expect(ACTION_KEYS.r).toBe('reply');
    expect(ACTION_KEYS.t).toBe('todo');
    expect(ACTION_KEYS.s).toBe('skip');
    expect(ACTION_KEYS.q).toBe('quit');
  });
});

describe('isValidActionKey', () => {
  it('should return true for valid action keys', () => {
    expect(isValidActionKey('d')).toBe(true);
    expect(isValidActionKey('a')).toBe(true);
    expect(isValidActionKey('r')).toBe(true);
    expect(isValidActionKey('t')).toBe(true);
    expect(isValidActionKey('s')).toBe(true);
    expect(isValidActionKey('q')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidActionKey('x')).toBe(false);
    expect(isValidActionKey('z')).toBe(false);
    expect(isValidActionKey('1')).toBe(false);
    expect(isValidActionKey('')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isValidActionKey('D')).toBe(true);
    expect(isValidActionKey('A')).toBe(true);
    expect(isValidActionKey('R')).toBe(true);
  });
});

describe('parseActionKey', () => {
  it('should parse valid action keys', () => {
    expect(parseActionKey('d')).toBe('delete');
    expect(parseActionKey('a')).toBe('archive');
    expect(parseActionKey('r')).toBe('reply');
    expect(parseActionKey('t')).toBe('todo');
    expect(parseActionKey('s')).toBe('skip');
    expect(parseActionKey('q')).toBe('quit');
  });

  it('should return null for invalid keys', () => {
    expect(parseActionKey('x')).toBeNull();
    expect(parseActionKey('z')).toBeNull();
    expect(parseActionKey('abc')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(parseActionKey('D')).toBe('delete');
    expect(parseActionKey('A')).toBe('archive');
    expect(parseActionKey('Q')).toBe('quit');
  });

  it('should trim whitespace', () => {
    expect(parseActionKey(' d ')).toBe('delete');
    expect(parseActionKey('\na\n')).toBe('archive');
  });

  it('should handle empty input', () => {
    expect(parseActionKey('')).toBeNull();
    expect(parseActionKey('   ')).toBeNull();
  });
});
