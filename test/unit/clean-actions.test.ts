/**
 * TDD Tests: Clean Inbox Action Handlers
 * T-2.1 to T-2.6: Action handlers for delete, archive, skip, reply, todo
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  createDeleteAction,
  createArchiveAction,
  createSkipAction,
  createReplyAction,
  createTodoAction,
} from '../../src/clean/actions';
import type { CleanInboxEmail, SessionAction } from '../../src/types';

// Helper to create mock email
function mockEmail(overrides: Partial<CleanInboxEmail> = {}): CleanInboxEmail {
  return {
    uid: 123,
    messageId: '<test@example.com>',
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    subject: 'Test Subject',
    date: new Date('2025-01-15T10:00:00Z'),
    snippet: 'Test email preview',
    isRead: false,
    isAutomated: false,
    ...overrides,
  };
}

describe('createDeleteAction', () => {
  it('should create a delete action for an email', () => {
    const email = mockEmail({ uid: 456, messageId: '<delete@test.com>' });

    const action = createDeleteAction(email);

    expect(action.type).toBe('delete');
    expect(action.emailUid).toBe(456);
    expect(action.messageId).toBe('<delete@test.com>');
    expect(action.timestamp).toBeInstanceOf(Date);
  });

  it('should set timestamp to current time', () => {
    const before = new Date();
    const action = createDeleteAction(mockEmail());
    const after = new Date();

    expect(action.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(action.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should not include metadata by default', () => {
    const action = createDeleteAction(mockEmail());
    expect(action.metadata).toBeUndefined();
  });
});

describe('createArchiveAction', () => {
  it('should create an archive action for an email', () => {
    const email = mockEmail({ uid: 789, messageId: '<archive@test.com>' });

    const action = createArchiveAction(email);

    expect(action.type).toBe('archive');
    expect(action.emailUid).toBe(789);
    expect(action.messageId).toBe('<archive@test.com>');
  });

  it('should include target mailbox in metadata', () => {
    const email = mockEmail();
    const action = createArchiveAction(email, 'Archive');

    expect(action.metadata?.targetMailbox).toBe('Archive');
  });

  it('should default to Archive mailbox', () => {
    const action = createArchiveAction(mockEmail());
    expect(action.metadata?.targetMailbox).toBe('Archive');
  });
});

describe('createSkipAction', () => {
  it('should create a skip action for an email', () => {
    const email = mockEmail({ uid: 111, messageId: '<skip@test.com>' });

    const action = createSkipAction(email);

    expect(action.type).toBe('skip');
    expect(action.emailUid).toBe(111);
    expect(action.messageId).toBe('<skip@test.com>');
  });

  it('should not include metadata', () => {
    const action = createSkipAction(mockEmail());
    expect(action.metadata).toBeUndefined();
  });
});

describe('createReplyAction', () => {
  it('should create a reply action with draft metadata', () => {
    const email = mockEmail({ uid: 222, messageId: '<reply@test.com>' });

    const action = createReplyAction(email, {
      draftUid: 999,
      draftMessageId: '<draft@test.com>',
      replyIntent: 'accept the invitation',
    });

    expect(action.type).toBe('reply');
    expect(action.emailUid).toBe(222);
    expect(action.messageId).toBe('<reply@test.com>');
    expect(action.metadata?.draftUid).toBe(999);
    expect(action.metadata?.draftMessageId).toBe('<draft@test.com>');
    expect(action.metadata?.replyIntent).toBe('accept the invitation');
  });

  it('should include target mailbox for archiving after reply', () => {
    const email = mockEmail();

    const action = createReplyAction(email, {
      draftUid: 888,
      targetMailbox: 'Archive',
    });

    expect(action.metadata?.targetMailbox).toBe('Archive');
  });

  it('should require draft UID', () => {
    const email = mockEmail();

    const action = createReplyAction(email, { draftUid: 777 });

    expect(action.metadata?.draftUid).toBe(777);
  });
});

describe('createTodoAction', () => {
  it('should create a todo action with Tana node ID', () => {
    const email = mockEmail({ uid: 333, messageId: '<todo@test.com>' });

    const action = createTodoAction(email, {
      tanaNodeId: 'abc123xyz',
      todoDescription: 'Follow up on proposal',
    });

    expect(action.type).toBe('todo');
    expect(action.emailUid).toBe(333);
    expect(action.messageId).toBe('<todo@test.com>');
    expect(action.metadata?.tanaNodeId).toBe('abc123xyz');
    expect(action.metadata?.todoDescription).toBe('Follow up on proposal');
  });

  it('should include target mailbox for archiving after todo', () => {
    const email = mockEmail();

    const action = createTodoAction(email, {
      tanaNodeId: 'node123',
      targetMailbox: 'Archive',
    });

    expect(action.metadata?.targetMailbox).toBe('Archive');
  });

  it('should work without optional todoDescription', () => {
    const email = mockEmail();

    const action = createTodoAction(email, { tanaNodeId: 'node456' });

    expect(action.metadata?.tanaNodeId).toBe('node456');
    expect(action.metadata?.todoDescription).toBeUndefined();
  });
});
