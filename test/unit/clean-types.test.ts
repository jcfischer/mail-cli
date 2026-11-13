/**
 * TDD Tests: Clean Inbox Types
 * T-1.1: CleanInbox types for session management and email processing
 */

import { describe, it, expect } from 'bun:test';
import type {
  CleanInboxSession,
  CleanInboxEmail,
  SessionAction,
  ActionMetadata,
  SessionStats,
  CleanInboxOptions,
} from '../../src/types';

describe('CleanInbox Types', () => {
  describe('CleanInboxEmail', () => {
    it('should have required email fields', () => {
      const email: CleanInboxEmail = {
        uid: 123,
        messageId: '<abc123@example.com>',
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        date: new Date('2025-01-15'),
        snippet: 'Email preview text...',
        isRead: false,
        isAutomated: false,
      };

      expect(email.uid).toBe(123);
      expect(email.messageId).toBe('<abc123@example.com>');
      expect(email.from).toBe('sender@example.com');
      expect(email.to).toContain('recipient@example.com');
      expect(email.subject).toBe('Test Subject');
      expect(email.isRead).toBe(false);
      expect(email.isAutomated).toBe(false);
    });

    it('should support optional fields', () => {
      const email: CleanInboxEmail = {
        uid: 456,
        messageId: '<def456@example.com>',
        from: 'sender@example.com',
        fromName: 'John Doe',
        to: ['recipient@example.com'],
        subject: 'Test',
        date: new Date(),
        snippet: 'Preview',
        body: 'Full email body content',
        isRead: true,
        isAutomated: true,
      };

      expect(email.fromName).toBe('John Doe');
      expect(email.body).toBe('Full email body content');
    });
  });

  describe('SessionAction', () => {
    it('should support all action types', () => {
      const actionTypes: SessionAction['type'][] = ['delete', 'archive', 'reply', 'todo', 'skip'];

      for (const type of actionTypes) {
        const action: SessionAction = {
          type,
          emailUid: 123,
          messageId: '<test@example.com>',
          timestamp: new Date(),
        };
        expect(action.type).toBe(type);
      }
    });

    it('should support action metadata', () => {
      const action: SessionAction = {
        type: 'reply',
        emailUid: 123,
        messageId: '<test@example.com>',
        timestamp: new Date(),
        metadata: {
          draftUid: 456,
          draftMessageId: '<draft@example.com>',
          replyIntent: 'accept the meeting',
        },
      };

      expect(action.metadata?.draftUid).toBe(456);
      expect(action.metadata?.replyIntent).toBe('accept the meeting');
    });

    it('should support todo metadata', () => {
      const action: SessionAction = {
        type: 'todo',
        emailUid: 789,
        messageId: '<task@example.com>',
        timestamp: new Date(),
        metadata: {
          tanaNodeId: 'abc123xyz',
          todoDescription: 'Follow up on proposal',
        },
      };

      expect(action.metadata?.tanaNodeId).toBe('abc123xyz');
      expect(action.metadata?.todoDescription).toBe('Follow up on proposal');
    });
  });

  describe('SessionStats', () => {
    it('should track all action counts', () => {
      const stats: SessionStats = {
        deleted: 5,
        archived: 10,
        replied: 3,
        todos: 2,
        skipped: 7,
        total: 27,
      };

      expect(stats.deleted).toBe(5);
      expect(stats.archived).toBe(10);
      expect(stats.replied).toBe(3);
      expect(stats.todos).toBe(2);
      expect(stats.skipped).toBe(7);
      expect(stats.total).toBe(27);
    });
  });

  describe('CleanInboxOptions', () => {
    it('should have required account field', () => {
      const options: CleanInboxOptions = {
        account: 'personal',
      };

      expect(options.account).toBe('personal');
    });

    it('should support optional flags', () => {
      const options: CleanInboxOptions = {
        account: 'work',
        limit: 50,
        replyOnly: true,
        quick: false,
        verbose: true,
      };

      expect(options.limit).toBe(50);
      expect(options.replyOnly).toBe(true);
      expect(options.quick).toBe(false);
      expect(options.verbose).toBe(true);
    });
  });

  describe('CleanInboxSession', () => {
    it('should contain all session state', () => {
      const session: CleanInboxSession = {
        account: 'personal',
        startTime: new Date(),
        emails: [],
        currentIndex: 0,
        actions: [],
        stats: {
          deleted: 0,
          archived: 0,
          replied: 0,
          todos: 0,
          skipped: 0,
          total: 0,
        },
        options: {
          account: 'personal',
        },
      };

      expect(session.account).toBe('personal');
      expect(session.currentIndex).toBe(0);
      expect(session.emails).toEqual([]);
      expect(session.actions).toEqual([]);
    });
  });
});
