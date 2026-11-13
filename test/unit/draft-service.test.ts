/**
 * TDD Tests: Draft Service
 * T-2.1: buildMessage() function
 * T-2.2: createDraft() function
 * T-2.3: Markdown-to-HTML support
 * T-2.5: In-Reply-To header support
 */

import { describe, it, expect } from 'bun:test';
import { buildMessage } from '../../src/draft/service';
import type { CreateDraftOptions, EmailAccount } from '../../src/types';

// Mock account for testing
const mockAccount: EmailAccount = {
  name: 'test',
  from: {
    name: 'Test User',
    email: 'test@example.com',
  },
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'test@example.com',
      pass: 'password123',
    },
  },
};

describe('buildMessage()', () => {
  it('should build a valid RFC 2822 message', async () => {
    const options: CreateDraftOptions = {
      to: ['recipient@example.com'],
      subject: 'Test Subject',
      body: 'Test body content',
    };

    const result = await buildMessage(options, mockAccount);

    // Should return a Buffer
    expect(result.message).toBeInstanceOf(Buffer);
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId).toMatch(/<.+@.+>/);

    // Convert to string for inspection
    const messageStr = result.message.toString('utf-8');

    // Should contain required headers
    expect(messageStr).toContain('From: Test User <test@example.com>');
    expect(messageStr).toContain('To: recipient@example.com');
    expect(messageStr).toContain('Subject: Test Subject');
    expect(messageStr).toContain('Message-ID:');
    expect(messageStr).toContain('Date:');

    // Should contain body
    expect(messageStr).toContain('Test body content');
  });

  it('should handle multiple recipients', async () => {
    const options: CreateDraftOptions = {
      to: ['one@example.com', 'two@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Multiple Recipients',
      body: 'Test',
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    expect(messageStr).toContain('To: one@example.com, two@example.com');
    expect(messageStr).toContain('Cc: cc@example.com');
    // BCC should NOT appear in message headers (handled at delivery)
  });

  it('should generate unique Message-ID', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Test',
      body: 'Test',
    };

    const result1 = await buildMessage(options, mockAccount);
    const result2 = await buildMessage(options, mockAccount);

    expect(result1.messageId).not.toBe(result2.messageId);
  });
});

describe('buildMessage() with markdown', () => {
  it('should render markdown to HTML when markdown=true', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Markdown Test',
      body: '# Heading\n\nThis is **bold** text.',
      markdown: true,
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    // Should be multipart/alternative
    expect(messageStr).toContain('multipart/alternative');
    // Should contain HTML version
    expect(messageStr).toContain('<h1>Heading</h1>');
    expect(messageStr).toContain('<strong>bold</strong>');
    // Should also contain plain text version
    expect(messageStr).toContain('# Heading');
  });

  it('should auto-detect markdown when markdown option is not specified', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Auto-detect Test',
      body: '- Item 1\n- Item 2\n\n**Bold text**',
      // markdown not specified - should auto-detect
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    // Should detect markdown and render HTML
    expect(messageStr).toContain('multipart/alternative');
  });

  it('should NOT render markdown when markdown=false', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Plain Text Test',
      body: '# Not a heading\n\nThis is **not bold**.',
      markdown: false,
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    // Should NOT be multipart/alternative
    expect(messageStr).not.toContain('multipart/alternative');
    // Should contain raw markdown syntax
    expect(messageStr).toContain('# Not a heading');
    expect(messageStr).toContain('**not bold**');
  });
});

describe('buildMessage() with In-Reply-To', () => {
  it('should add In-Reply-To header for threading', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Re: Original Subject',
      body: 'Reply content',
      inReplyTo: '<original-message-id@example.com>',
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    expect(messageStr).toContain('In-Reply-To: <original-message-id@example.com>');
  });

  it('should add References header when provided', async () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Re: Thread',
      body: 'Reply in thread',
      inReplyTo: '<msg3@example.com>',
      references: ['<msg1@example.com>', '<msg2@example.com>', '<msg3@example.com>'],
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    expect(messageStr).toContain('In-Reply-To: <msg3@example.com>');
    expect(messageStr).toContain('References:');
    expect(messageStr).toContain('<msg1@example.com>');
  });
});
