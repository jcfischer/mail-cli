/**
 * TDD Tests: Clean Inbox Display Formatter
 * T-3.1: Format emails and session info for display
 */

import { describe, it, expect } from 'bun:test';
import {
  formatEmailHeader,
  formatEmailSnippet,
  formatProgressBar,
  formatActionPrompt,
  formatSessionStats,
} from '../../src/clean/display';
import type { CleanInboxEmail, CleanInboxSession, SessionStats } from '../../src/types';

// Helper to create mock email
function mockEmail(overrides: Partial<CleanInboxEmail> = {}): CleanInboxEmail {
  return {
    uid: 123,
    messageId: '<test@example.com>',
    from: 'Alice Smith <alice@example.com>',
    to: ['me@example.com'],
    subject: 'Meeting Tomorrow',
    date: new Date('2025-01-15T10:30:00Z'),
    snippet: 'Hi, I wanted to follow up about our meeting tomorrow. Please let me know if 2pm works.',
    isRead: false,
    isAutomated: false,
    ...overrides,
  };
}

describe('formatEmailHeader', () => {
  it('should format email header with from, subject, date', () => {
    const email = mockEmail();
    const header = formatEmailHeader(email);

    expect(header).toContain('Alice Smith');
    expect(header).toContain('Meeting Tomorrow');
    // Date should be formatted
    expect(header).toMatch(/Jan|2025|10:30/);
  });

  it('should show [Unread] badge for unread emails', () => {
    const unreadEmail = mockEmail({ isRead: false });
    const readEmail = mockEmail({ isRead: true });

    expect(formatEmailHeader(unreadEmail)).toContain('[Unread]');
    expect(formatEmailHeader(readEmail)).not.toContain('[Unread]');
  });

  it('should show [Auto] badge for automated emails', () => {
    const automatedEmail = mockEmail({ isAutomated: true });
    const humanEmail = mockEmail({ isAutomated: false });

    expect(formatEmailHeader(automatedEmail)).toContain('[Auto]');
    expect(formatEmailHeader(humanEmail)).not.toContain('[Auto]');
  });

  it('should use fromName when available', () => {
    const emailWithName = mockEmail({ fromName: 'Bob Jones', from: 'bob@example.com' });
    const header = formatEmailHeader(emailWithName);

    expect(header).toContain('Bob Jones');
  });

  it('should fall back to email address if no name', () => {
    const emailNoName = mockEmail({ from: 'noreply@service.com', fromName: undefined });
    const header = formatEmailHeader(emailNoName);

    expect(header).toContain('noreply@service.com');
  });
});

describe('formatEmailSnippet', () => {
  it('should return snippet text', () => {
    const email = mockEmail({ snippet: 'This is the email preview text' });
    const snippet = formatEmailSnippet(email);

    expect(snippet).toContain('This is the email preview text');
  });

  it('should truncate long snippets', () => {
    const longSnippet = 'A'.repeat(300);
    const email = mockEmail({ snippet: longSnippet });
    const snippet = formatEmailSnippet(email, { maxLength: 100 });

    expect(snippet.length).toBeLessThanOrEqual(103); // 100 + "..."
    expect(snippet).toContain('...');
  });

  it('should preserve short snippets', () => {
    const email = mockEmail({ snippet: 'Short message' });
    const snippet = formatEmailSnippet(email, { maxLength: 100 });

    expect(snippet).toBe('Short message');
    expect(snippet).not.toContain('...');
  });

  it('should handle empty snippet', () => {
    const email = mockEmail({ snippet: '' });
    const snippet = formatEmailSnippet(email);

    expect(snippet).toBe('(no preview)');
  });
});

describe('formatProgressBar', () => {
  it('should show current position and total', () => {
    const progress = formatProgressBar(5, 20);

    expect(progress).toContain('5');
    expect(progress).toContain('20');
  });

  it('should show percentage', () => {
    const progress = formatProgressBar(10, 40);

    expect(progress).toContain('25%');
  });

  it('should handle 0 total gracefully', () => {
    const progress = formatProgressBar(0, 0);

    expect(progress).toContain('0');
    expect(progress).not.toContain('NaN');
  });

  it('should show 100% when at end', () => {
    const progress = formatProgressBar(20, 20);

    expect(progress).toContain('100%');
  });
});

describe('formatActionPrompt', () => {
  it('should list available actions', () => {
    const prompt = formatActionPrompt();

    expect(prompt).toContain('[d]');
    expect(prompt).toContain('[a]');
    expect(prompt).toContain('[r]');
    expect(prompt).toContain('[t]');
    expect(prompt).toContain('[s]');
    expect(prompt).toContain('[q]');
  });

  it('should include action descriptions', () => {
    const prompt = formatActionPrompt();

    expect(prompt.toLowerCase()).toContain('delete');
    expect(prompt.toLowerCase()).toContain('archive');
    expect(prompt.toLowerCase()).toContain('reply');
    expect(prompt.toLowerCase()).toContain('todo');
    expect(prompt.toLowerCase()).toContain('skip');
    expect(prompt.toLowerCase()).toContain('quit');
  });
});

describe('formatSessionStats', () => {
  it('should format all stat counts', () => {
    const stats: SessionStats = {
      deleted: 5,
      archived: 12,
      replied: 3,
      todos: 2,
      skipped: 8,
      total: 30,
    };

    const formatted = formatSessionStats(stats);

    expect(formatted).toContain('5');
    expect(formatted).toContain('12');
    expect(formatted).toContain('3');
    expect(formatted).toContain('2');
    expect(formatted).toContain('8');
    expect(formatted).toContain('30');
  });

  it('should label each stat type', () => {
    const stats: SessionStats = {
      deleted: 1,
      archived: 1,
      replied: 1,
      todos: 1,
      skipped: 1,
      total: 5,
    };

    const formatted = formatSessionStats(stats);

    expect(formatted.toLowerCase()).toContain('deleted');
    expect(formatted.toLowerCase()).toContain('archived');
    expect(formatted.toLowerCase()).toContain('replied');
    expect(formatted.toLowerCase()).toContain('todo');
    expect(formatted.toLowerCase()).toContain('skipped');
  });

  it('should handle zero stats', () => {
    const stats: SessionStats = {
      deleted: 0,
      archived: 0,
      replied: 0,
      todos: 0,
      skipped: 0,
      total: 0,
    };

    const formatted = formatSessionStats(stats);

    // Should not throw and should contain zeros
    expect(formatted).toBeDefined();
  });
});
