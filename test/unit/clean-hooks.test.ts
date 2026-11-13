/**
 * TDD Tests: Clean Inbox Hook Link Generator
 * T-1.4: Generate hook://email/ links for Tana integration
 */

import { describe, it, expect } from 'bun:test';
import { generateEmailHookLink } from '../../src/clean/hooks';

describe('generateEmailHookLink', () => {
  it('should generate hook URL from simple message ID', () => {
    const messageId = 'abc123@mail.example.com';
    const hookLink = generateEmailHookLink(messageId);

    expect(hookLink).toBe('hook://email/abc123%40mail.example.com');
  });

  it('should strip angle brackets from message ID', () => {
    const messageId = '<abc123@mail.example.com>';
    const hookLink = generateEmailHookLink(messageId);

    // Should not include < or > in the URL
    expect(hookLink).not.toContain('<');
    expect(hookLink).not.toContain('>');
    expect(hookLink).toBe('hook://email/abc123%40mail.example.com');
  });

  it('should URL-encode special characters', () => {
    // Gmail message IDs often contain = and other special chars
    const messageId = '<CADc-_xYyZ=abc@mail.gmail.com>';
    const hookLink = generateEmailHookLink(messageId);

    // = should be encoded as %3D, @ as %40
    expect(hookLink).toContain('%3D');
    expect(hookLink).toContain('%40');
    expect(hookLink).toBe('hook://email/CADc-_xYyZ%3Dabc%40mail.gmail.com');
  });

  it('should handle message IDs with + characters', () => {
    const messageId = '<abc+def@example.com>';
    const hookLink = generateEmailHookLink(messageId);

    // + should be encoded as %2B
    expect(hookLink).toContain('%2B');
    expect(hookLink).toBe('hook://email/abc%2Bdef%40example.com');
  });

  it('should handle empty string gracefully', () => {
    const hookLink = generateEmailHookLink('');
    expect(hookLink).toBe('hook://email/');
  });

  it('should handle message ID with only angle brackets', () => {
    const hookLink = generateEmailHookLink('<>');
    expect(hookLink).toBe('hook://email/');
  });

  it('should preserve alphanumeric characters', () => {
    const messageId = 'ABC123xyz789';
    const hookLink = generateEmailHookLink(messageId);

    expect(hookLink).toBe('hook://email/ABC123xyz789');
  });

  it('should handle complex real-world message ID', () => {
    // Real Gmail message ID format
    const messageId = '<CAKR_abc123def456.789xyz@mail.gmail.com>';
    const hookLink = generateEmailHookLink(messageId);

    expect(hookLink).toStartWith('hook://email/');
    expect(hookLink).not.toContain('<');
    expect(hookLink).not.toContain('>');
  });
});
