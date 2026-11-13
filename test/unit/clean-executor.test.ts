/**
 * TDD Tests: Clean Inbox Action Executor
 * T-2.6: Execute actions against IMAP server
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import {
  executeDeleteAction,
  executeArchiveAction,
  executeSkipAction,
} from '../../src/clean/executor';
import type { SessionAction } from '../../src/types';

// Mock IMAP client interface for testing
interface MockImapClient {
  deleteMessage: (uid: number, mailbox?: string) => Promise<void>;
  moveMessage: (uid: number, targetMailbox: string, sourceMailbox?: string) => Promise<void>;
  markAsRead: (uid: number, mailbox?: string) => Promise<void>;
}

describe('executeDeleteAction', () => {
  it('should call deleteMessage on IMAP client', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'delete',
      emailUid: 123,
      messageId: '<test@example.com>',
      timestamp: new Date(),
    };

    await executeDeleteAction(mockClient as any, action, 'INBOX');

    expect(mockClient.deleteMessage).toHaveBeenCalledWith(123, 'INBOX');
  });

  it('should use default mailbox if not specified', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'delete',
      emailUid: 456,
      messageId: '<test@example.com>',
      timestamp: new Date(),
    };

    await executeDeleteAction(mockClient as any, action);

    expect(mockClient.deleteMessage).toHaveBeenCalledWith(456, 'INBOX');
  });
});

describe('executeArchiveAction', () => {
  it('should move message to Archive and mark as read', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'archive',
      emailUid: 789,
      messageId: '<archive@example.com>',
      timestamp: new Date(),
      metadata: {
        targetMailbox: 'Archive',
      },
    };

    await executeArchiveAction(mockClient as any, action, 'INBOX');

    // Should mark as read first, then move
    expect(mockClient.markAsRead).toHaveBeenCalledWith(789, 'INBOX');
    expect(mockClient.moveMessage).toHaveBeenCalledWith(789, 'Archive', 'INBOX');
  });

  it('should use custom target mailbox from metadata', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'archive',
      emailUid: 111,
      messageId: '<test@example.com>',
      timestamp: new Date(),
      metadata: {
        targetMailbox: 'OldMail',
      },
    };

    await executeArchiveAction(mockClient as any, action, 'INBOX');

    expect(mockClient.moveMessage).toHaveBeenCalledWith(111, 'OldMail', 'INBOX');
  });

  it('should default to Archive if no target specified', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'archive',
      emailUid: 222,
      messageId: '<test@example.com>',
      timestamp: new Date(),
      // No metadata
    };

    await executeArchiveAction(mockClient as any, action, 'INBOX');

    expect(mockClient.moveMessage).toHaveBeenCalledWith(222, 'Archive', 'INBOX');
  });
});

describe('executeSkipAction', () => {
  it('should not perform any IMAP operation', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'skip',
      emailUid: 333,
      messageId: '<skip@example.com>',
      timestamp: new Date(),
    };

    await executeSkipAction(mockClient as any, action);

    // Skip should not call any IMAP methods
    expect(mockClient.deleteMessage).not.toHaveBeenCalled();
    expect(mockClient.moveMessage).not.toHaveBeenCalled();
    expect(mockClient.markAsRead).not.toHaveBeenCalled();
  });

  it('should return immediately without errors', async () => {
    const mockClient: MockImapClient = {
      deleteMessage: mock(() => Promise.resolve()),
      moveMessage: mock(() => Promise.resolve()),
      markAsRead: mock(() => Promise.resolve()),
    };

    const action: SessionAction = {
      type: 'skip',
      emailUid: 444,
      messageId: '<skip2@example.com>',
      timestamp: new Date(),
    };

    // Should not throw
    await expect(executeSkipAction(mockClient as any, action)).resolves.toBeUndefined();
  });
});
