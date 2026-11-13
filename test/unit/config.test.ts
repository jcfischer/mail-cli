/**
 * TDD Tests: Config module
 * Bug fix: Case-insensitive account lookup
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getAccount, validateSignaturePath, getSignaturesDir } from '../../src/config';
import type { EmailConfig } from '../../src/types';
import { homedir } from 'os';
import { join } from 'path';

// Mock config for testing
const mockConfig: EmailConfig = {
  defaultAccount: 'personal',
  accounts: {
    personal: {
      from: 'test@example.com',
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password123',
        },
      },
    },
    work: {
      from: 'work@company.com',
      smtp: {
        host: 'smtp.company.com',
        port: 587,
        secure: false,
        auth: {
          user: 'work@company.com',
          pass: 'workpass',
        },
      },
    },
  },
};

describe('getAccount() case-insensitive lookup', () => {
  it('should find account with exact case match', () => {
    const account = getAccount(mockConfig, 'personal');
    expect(account.from).toBe('test@example.com');
  });

  it('should find account with different case - "Personal"', () => {
    const account = getAccount(mockConfig, 'Personal');
    expect(account.from).toBe('test@example.com');
  });

  it('should find account with different case - "PERSONAL"', () => {
    const account = getAccount(mockConfig, 'PERSONAL');
    expect(account.from).toBe('test@example.com');
  });

  it('should find account with different case - "Work"', () => {
    const account = getAccount(mockConfig, 'Work');
    expect(account.from).toBe('work@company.com');
  });

  it('should throw for non-existent account', () => {
    expect(() => getAccount(mockConfig, 'nonexistent')).toThrow('not found');
  });

  it('should list available accounts in error message', () => {
    try {
      getAccount(mockConfig, 'nonexistent');
    } catch (error: any) {
      expect(error.message).toContain('personal');
      expect(error.message).toContain('work');
    }
  });
});

describe('validateSignaturePath()', () => {
  it('should allow paths in signatures directory', () => {
    const sigPath = join(getSignaturesDir(), 'personal.html');
    expect(validateSignaturePath(sigPath)).toBe(true);
  });

  it('should allow paths in config directory', () => {
    const configPath = join(homedir(), '.config', 'email', 'custom-sig.html');
    expect(validateSignaturePath(configPath)).toBe(true);
  });

  it('should reject paths outside config directory', () => {
    const homePath = join(homedir(), 'Documents', 'signature.html');
    expect(validateSignaturePath(homePath)).toBe(false);
  });

  it('should reject paths outside home directory', () => {
    expect(validateSignaturePath('/etc/passwd')).toBe(false);
  });

  it('should reject path traversal attempts', () => {
    const traversalPath = join(getSignaturesDir(), '..', '..', '..', 'etc', 'passwd');
    expect(validateSignaturePath(traversalPath)).toBe(false);
  });
});
