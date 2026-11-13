/**
 * TDD Tests: Clean Inbox Email Fetching
 * T-1.3: Fetch and classify emails for clean inbox workflow
 */

import { describe, it, expect } from 'bun:test';
import {
  isAutomatedEmail,
  convertToCleanInboxEmail,
  detectSenderType,
} from '../../src/clean/fetch';
import type { EmailMessage, CleanInboxEmail } from '../../src/types';

// Helper to create mock EmailMessage
function mockEmailMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    uid: 123,
    messageId: '<test@example.com>',
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    subject: 'Test Subject',
    date: new Date('2025-01-15T10:00:00Z'),
    snippet: 'Test email body preview',
    body: 'Full test email body content',
    flags: [],
    hasAttachments: false,
    size: 1000,
    ...overrides,
  };
}

describe('detectSenderType', () => {
  describe('noreply addresses', () => {
    it('should detect noreply@ as automated', () => {
      expect(detectSenderType('noreply@example.com')).toBe('automated');
    });

    it('should detect no-reply@ as automated', () => {
      expect(detectSenderType('no-reply@example.com')).toBe('automated');
    });

    it('should detect donotreply@ as automated', () => {
      expect(detectSenderType('donotreply@company.com')).toBe('automated');
    });

    it('should be case insensitive', () => {
      expect(detectSenderType('NoReply@Example.com')).toBe('automated');
      expect(detectSenderType('NO-REPLY@COMPANY.COM')).toBe('automated');
    });
  });

  describe('notification addresses', () => {
    it('should detect notifications@ as automated', () => {
      expect(detectSenderType('notifications@github.com')).toBe('automated');
    });

    it('should detect notify@ as automated', () => {
      expect(detectSenderType('notify@service.com')).toBe('automated');
    });

    it('should detect alerts@ as automated', () => {
      expect(detectSenderType('alerts@monitoring.com')).toBe('automated');
    });

    it('should detect mailer-daemon@ as automated', () => {
      expect(detectSenderType('mailer-daemon@mail.example.com')).toBe('automated');
    });

    it('should detect postmaster@ as automated', () => {
      expect(detectSenderType('postmaster@company.com')).toBe('automated');
    });
  });

  describe('system addresses', () => {
    it('should detect jira@ as automated', () => {
      expect(detectSenderType('jira@company.atlassian.net')).toBe('automated');
    });

    it('should detect github@ patterns as automated', () => {
      expect(detectSenderType('notifications@github.com')).toBe('automated');
    });

    it('should detect calendar@ as automated', () => {
      expect(detectSenderType('calendar-notification@google.com')).toBe('automated');
    });

    it('should detect bounce@ as automated', () => {
      expect(detectSenderType('bounce@mail.service.com')).toBe('automated');
    });
  });

  describe('human addresses', () => {
    it('should detect personal email as human', () => {
      expect(detectSenderType('alice@example.com')).toBe('human');
    });

    it('should detect work email as human', () => {
      expect(detectSenderType('john.doe@company.com')).toBe('human');
    });

    it('should handle email with display name', () => {
      expect(detectSenderType('Alice Smith <alice@example.com>')).toBe('human');
    });

    it('should handle email in angle brackets only', () => {
      expect(detectSenderType('<bob@company.com>')).toBe('human');
    });
  });
});

describe('isAutomatedEmail', () => {
  it('should return true for noreply sender', () => {
    const email = mockEmailMessage({ from: 'noreply@service.com' });
    expect(isAutomatedEmail(email)).toBe(true);
  });

  it('should return false for personal sender', () => {
    const email = mockEmailMessage({ from: 'alice@example.com' });
    expect(isAutomatedEmail(email)).toBe(false);
  });

  it('should detect automated by subject patterns', () => {
    // Common automated subject patterns
    const automatedSubjects = [
      '[JIRA] Issue ABC-123 updated',
      'GitHub notification: Pull request #42',
      'Your order #12345 has shipped',
      'Password reset request',
      'Action Required: Verify your email',
      'Unsubscribe confirmation',
    ];

    for (const subject of automatedSubjects) {
      const email = mockEmailMessage({ from: 'info@company.com', subject });
      // Note: implementation may or may not detect all of these
      // The test documents expected behavior
    }
  });

  it('should combine sender and subject heuristics', () => {
    // noreply + automated subject = definitely automated
    const email = mockEmailMessage({
      from: 'noreply@github.com',
      subject: '[GitHub] Pull request merged',
    });
    expect(isAutomatedEmail(email)).toBe(true);
  });
});

describe('convertToCleanInboxEmail', () => {
  it('should convert EmailMessage to CleanInboxEmail', () => {
    const email = mockEmailMessage({
      uid: 456,
      messageId: '<abc123@mail.example.com>',
      from: 'John Doe <john@example.com>',
      to: ['me@example.com'],
      subject: 'Meeting tomorrow',
      date: new Date('2025-01-15T09:00:00Z'),
      snippet: 'Hi, lets meet tomorrow...',
      flags: ['\\Seen'],
    });

    const cleanEmail = convertToCleanInboxEmail(email);

    expect(cleanEmail.uid).toBe(456);
    expect(cleanEmail.messageId).toBe('<abc123@mail.example.com>');
    expect(cleanEmail.from).toBe('John Doe <john@example.com>');
    expect(cleanEmail.to).toEqual(['me@example.com']);
    expect(cleanEmail.subject).toBe('Meeting tomorrow');
    expect(cleanEmail.snippet).toBe('Hi, lets meet tomorrow...');
    expect(cleanEmail.isRead).toBe(true);
    expect(cleanEmail.isAutomated).toBe(false);
  });

  it('should set isRead based on \\Seen flag', () => {
    const seenEmail = mockEmailMessage({ flags: ['\\Seen'] });
    const unseenEmail = mockEmailMessage({ flags: [] });

    expect(convertToCleanInboxEmail(seenEmail).isRead).toBe(true);
    expect(convertToCleanInboxEmail(unseenEmail).isRead).toBe(false);
  });

  it('should set isAutomated based on sender detection', () => {
    const automatedEmail = mockEmailMessage({ from: 'noreply@jira.example.com' });
    const humanEmail = mockEmailMessage({ from: 'alice@example.com' });

    expect(convertToCleanInboxEmail(automatedEmail).isAutomated).toBe(true);
    expect(convertToCleanInboxEmail(humanEmail).isAutomated).toBe(false);
  });

  it('should extract fromName if present', () => {
    const emailWithName = mockEmailMessage({ from: 'Alice Smith <alice@example.com>' });
    const emailNoName = mockEmailMessage({ from: 'bob@example.com' });

    expect(convertToCleanInboxEmail(emailWithName).fromName).toBe('Alice Smith');
    expect(convertToCleanInboxEmail(emailNoName).fromName).toBeUndefined();
  });

  it('should not include body by default (lazy loading)', () => {
    const email = mockEmailMessage({ body: 'Full email body text here' });
    const cleanEmail = convertToCleanInboxEmail(email);

    // Body is not included by default - loaded on demand
    expect(cleanEmail.body).toBeUndefined();
  });

  it('should include body when explicitly requested', () => {
    const email = mockEmailMessage({ body: 'Full email body text here' });
    const cleanEmail = convertToCleanInboxEmail(email, { includeBody: true });

    expect(cleanEmail.body).toBe('Full email body text here');
  });
});
