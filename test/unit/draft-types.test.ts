/**
 * TDD Test: Draft Creation Types
 * Task T-1.1: Add CreateDraftOptions and DraftResult types
 */

import { describe, it, expect } from 'bun:test';
import type { CreateDraftOptions, DraftResult, EmailAttachment } from '../../src/types';

describe('CreateDraftOptions type', () => {
  it('should accept valid draft options with required fields', () => {
    const options: CreateDraftOptions = {
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: 'Test body content',
    };

    expect(options.to).toEqual(['test@example.com']);
    expect(options.subject).toBe('Test Subject');
    expect(options.body).toBe('Test body content');
  });

  it('should accept all optional fields', () => {
    const attachment: EmailAttachment = {
      filename: 'report.pdf',
      path: '/path/to/report.pdf',
    };

    const options: CreateDraftOptions = {
      to: ['primary@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Full Options Test',
      body: '# Markdown Content',
      markdown: true,
      attachments: [attachment],
      account: 'personal',
      inReplyTo: '<original-message-id@example.com>',
      references: ['<ref1@example.com>', '<ref2@example.com>'],
    };

    expect(options.cc).toEqual(['cc@example.com']);
    expect(options.bcc).toEqual(['bcc@example.com']);
    expect(options.markdown).toBe(true);
    expect(options.attachments).toHaveLength(1);
    expect(options.account).toBe('personal');
    expect(options.inReplyTo).toBe('<original-message-id@example.com>');
    expect(options.references).toHaveLength(2);
  });
});

describe('DraftResult type', () => {
  it('should represent successful draft creation', () => {
    const result: DraftResult = {
      success: true,
      uid: 12345,
      messageId: '<generated-id@example.com>',
      account: 'personal',
      mailbox: 'Drafts',
    };

    expect(result.success).toBe(true);
    expect(result.uid).toBe(12345);
    expect(result.messageId).toBe('<generated-id@example.com>');
    expect(result.account).toBe('personal');
    expect(result.mailbox).toBe('Drafts');
    expect(result.error).toBeUndefined();
  });

  it('should represent failed draft creation', () => {
    const result: DraftResult = {
      success: false,
      messageId: '',
      account: 'personal',
      mailbox: 'Drafts',
      error: 'Connection failed',
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection failed');
    expect(result.uid).toBeUndefined();
  });
});
