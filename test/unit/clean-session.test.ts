/**
 * TDD Tests: Clean Inbox Session Management
 * T-1.2: Session lifecycle - create, navigate, record actions, summarize
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createSession,
  nextEmail,
  currentEmail,
  recordAction,
  getSessionSummary,
  initializeStats,
} from '../../src/clean/session';
import type {
  CleanInboxSession,
  CleanInboxEmail,
  CleanInboxOptions,
  SessionAction,
} from '../../src/types';

describe('Session Management', () => {
  const mockEmails: CleanInboxEmail[] = [
    {
      uid: 1,
      messageId: '<email1@example.com>',
      from: 'alice@example.com',
      to: ['me@example.com'],
      subject: 'First email',
      date: new Date('2025-01-15T10:00:00Z'),
      snippet: 'Hello from Alice',
      isRead: false,
      isAutomated: false,
    },
    {
      uid: 2,
      messageId: '<email2@example.com>',
      from: 'bob@example.com',
      to: ['me@example.com'],
      subject: 'Second email',
      date: new Date('2025-01-15T11:00:00Z'),
      snippet: 'Hello from Bob',
      isRead: true,
      isAutomated: false,
    },
    {
      uid: 3,
      messageId: '<email3@example.com>',
      from: 'noreply@jira.example.com',
      to: ['me@example.com'],
      subject: 'JIRA notification',
      date: new Date('2025-01-15T12:00:00Z'),
      snippet: 'Issue updated',
      isRead: false,
      isAutomated: true,
    },
  ];

  describe('initializeStats', () => {
    it('should create zeroed stats with total', () => {
      const stats = initializeStats(10);

      expect(stats.deleted).toBe(0);
      expect(stats.archived).toBe(0);
      expect(stats.replied).toBe(0);
      expect(stats.todos).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.total).toBe(10);
    });
  });

  describe('createSession', () => {
    it('should create session with provided emails and options', () => {
      const options: CleanInboxOptions = {
        account: 'personal',
        limit: 50,
      };

      const session = createSession(options, mockEmails);

      expect(session.account).toBe('personal');
      expect(session.emails).toEqual(mockEmails);
      expect(session.currentIndex).toBe(0);
      expect(session.actions).toEqual([]);
      expect(session.stats.total).toBe(3);
      expect(session.options).toEqual(options);
    });

    it('should set start time to now', () => {
      const before = new Date();
      const session = createSession({ account: 'test' }, mockEmails);
      const after = new Date();

      expect(session.startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.startTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should handle empty email list', () => {
      const session = createSession({ account: 'test' }, []);

      expect(session.emails).toEqual([]);
      expect(session.stats.total).toBe(0);
    });
  });

  describe('currentEmail', () => {
    it('should return email at current index', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      const email = currentEmail(session);

      expect(email).toEqual(mockEmails[0]);
    });

    it('should return null when past end of list', () => {
      const session = createSession({ account: 'test' }, mockEmails);
      session.currentIndex = 3;

      const email = currentEmail(session);

      expect(email).toBeNull();
    });

    it('should return null for empty session', () => {
      const session = createSession({ account: 'test' }, []);

      const email = currentEmail(session);

      expect(email).toBeNull();
    });
  });

  describe('nextEmail', () => {
    it('should advance index and return next email', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      const email = nextEmail(session);

      expect(session.currentIndex).toBe(1);
      expect(email).toEqual(mockEmails[1]);
    });

    it('should return null when no more emails', () => {
      const session = createSession({ account: 'test' }, mockEmails);
      session.currentIndex = 2;

      const email = nextEmail(session);

      expect(email).toBeNull();
      expect(session.currentIndex).toBe(3);
    });

    it('should handle single email list', () => {
      const session = createSession({ account: 'test' }, [mockEmails[0]]);

      const email = nextEmail(session);

      expect(email).toBeNull();
      expect(session.currentIndex).toBe(1);
    });
  });

  describe('recordAction', () => {
    it('should add action to session actions list', () => {
      const session = createSession({ account: 'test' }, mockEmails);
      const action: SessionAction = {
        type: 'delete',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
      };

      recordAction(session, action);

      expect(session.actions).toHaveLength(1);
      expect(session.actions[0]).toEqual(action);
    });

    it('should increment correct stat counter for delete', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, {
        type: 'delete',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
      });

      expect(session.stats.deleted).toBe(1);
    });

    it('should increment correct stat counter for archive', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, {
        type: 'archive',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
      });

      expect(session.stats.archived).toBe(1);
    });

    it('should increment correct stat counter for reply', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, {
        type: 'reply',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
        metadata: { draftUid: 100 },
      });

      expect(session.stats.replied).toBe(1);
    });

    it('should increment correct stat counter for todo', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, {
        type: 'todo',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
        metadata: { tanaNodeId: 'abc123' },
      });

      expect(session.stats.todos).toBe(1);
    });

    it('should increment correct stat counter for skip', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, {
        type: 'skip',
        emailUid: 1,
        messageId: '<email1@example.com>',
        timestamp: new Date(),
      });

      expect(session.stats.skipped).toBe(1);
    });

    it('should track multiple actions', () => {
      const session = createSession({ account: 'test' }, mockEmails);

      recordAction(session, { type: 'delete', emailUid: 1, messageId: '<1>', timestamp: new Date() });
      recordAction(session, { type: 'archive', emailUid: 2, messageId: '<2>', timestamp: new Date() });
      recordAction(session, { type: 'archive', emailUid: 3, messageId: '<3>', timestamp: new Date() });

      expect(session.stats.deleted).toBe(1);
      expect(session.stats.archived).toBe(2);
      expect(session.actions).toHaveLength(3);
    });
  });

  describe('getSessionSummary', () => {
    it('should generate summary with all stats', () => {
      const session = createSession({ account: 'personal' }, mockEmails);
      session.stats = {
        deleted: 5,
        archived: 10,
        replied: 3,
        todos: 2,
        skipped: 7,
        total: 27,
      };

      const summary = getSessionSummary(session);

      expect(summary).toContain('27');
      expect(summary).toContain('5');
      expect(summary).toContain('10');
      expect(summary).toContain('3');
      expect(summary).toContain('2');
      expect(summary).toContain('7');
    });

    it('should include account name', () => {
      const session = createSession({ account: 'work' }, mockEmails);

      const summary = getSessionSummary(session);

      expect(summary).toContain('work');
    });

    it('should handle zero stats', () => {
      const session = createSession({ account: 'test' }, []);

      const summary = getSessionSummary(session);

      expect(summary).toContain('0');
    });
  });
});
