/**
 * TDD Tests: Draft Attachments
 * T-2.4: Attachment handling in draft creation
 */

import { describe, it, expect } from 'bun:test';
import { buildMessage } from '../../src/draft/service';
import type { CreateDraftOptions, EmailAccount, EmailAttachment } from '../../src/types';

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

describe('buildMessage() with attachments', () => {
  it('should include attachment from Buffer content', async () => {
    const attachment: EmailAttachment = {
      filename: 'test.txt',
      content: Buffer.from('Hello, World!'),
      contentType: 'text/plain',
    };

    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Email with attachment',
      body: 'Please see attached.',
      attachments: [attachment],
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    // Should be multipart/mixed for attachments
    expect(messageStr).toContain('multipart/mixed');
    expect(messageStr).toContain('filename=test.txt');
    expect(messageStr).toContain('Content-Disposition: attachment');
  });

  it('should handle multiple attachments', async () => {
    const attachments: EmailAttachment[] = [
      {
        filename: 'file1.txt',
        content: Buffer.from('Content 1'),
        contentType: 'text/plain',
      },
      {
        filename: 'file2.txt',
        content: Buffer.from('Content 2'),
        contentType: 'text/plain',
      },
    ];

    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Multiple attachments',
      body: 'See attached files.',
      attachments,
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    expect(messageStr).toContain('filename=file1.txt');
    expect(messageStr).toContain('filename=file2.txt');
  });

  it('should handle attachment with string content', async () => {
    const attachment: EmailAttachment = {
      filename: 'data.json',
      content: '{"key": "value"}',
      contentType: 'application/json',
    };

    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'JSON attachment',
      body: 'JSON data attached.',
      attachments: [attachment],
    };

    const result = await buildMessage(options, mockAccount);
    const messageStr = result.message.toString('utf-8');

    expect(messageStr).toContain('filename=data.json');
    expect(messageStr).toContain('application/json');
  });
});
