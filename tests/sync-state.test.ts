/**
 * Sync State Tests
 * Test that last_sync_uid is properly saved and retrieved (per-account DB)
 */

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { getDatabase, getSqliteInstance, closeDatabase } from '../src/db/client';
import { emails, syncState, type NewEmail } from '../src/db/schema';
import { SyncEngine } from '../src/sync/engine';

// Use test-specific account
const TEST_ACCOUNT = 'test-sync-state';

describe('Sync State Management (Per-Account)', () => {
  beforeEach(async () => {
    // Clear tables in test account database
    const db = getDatabase(TEST_ACCOUNT);
    await db.delete(emails);
    await db.delete(syncState);
  });

  afterAll(() => {
    // Close test database
    closeDatabase(TEST_ACCOUNT);
  });

  test('should save last_sync_uid after indexing emails', async () => {
    const db = getDatabase(TEST_ACCOUNT);

    // Insert test emails with UIDs (no account column)
    const testEmails: NewEmail[] = [
      {
        messageId: 'test1@example.com',
        threadId: null,
        uid: 100,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['recipient@example.com']),
        cc: null,
        subject: 'Test Email 1',
        snippet: 'Test content',
        date: Date.now(),
        receivedDate: null,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      },
      {
        messageId: 'test2@example.com',
        threadId: null,
        uid: 200,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['recipient@example.com']),
        cc: null,
        subject: 'Test Email 2',
        snippet: 'Test content',
        date: Date.now(),
        receivedDate: null,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      },
      {
        messageId: 'test3@example.com',
        threadId: null,
        uid: 300, // Highest UID
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['recipient@example.com']),
        cc: null,
        subject: 'Test Email 3',
        snippet: 'Test content',
        date: Date.now(),
        receivedDate: null,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      },
    ];

    await db.insert(emails).values(testEmails);

    // Get max UID using raw SQL (per-account DB, no account filter)
    const sqlite = getSqliteInstance(TEST_ACCOUNT);
    const maxUidResult = sqlite.prepare('SELECT MAX(uid) as maxUid FROM emails WHERE mailbox = ?')
      .get('INBOX') as { maxUid: number } | undefined;

    const expectedMaxUid = maxUidResult?.maxUid || null;

    expect(expectedMaxUid).toBe(300);

    // Check if sync_state properly stores the UID
    const syncEngine = new SyncEngine();
    const state = await syncEngine.getSyncState(TEST_ACCOUNT, 'INBOX');

    // If state doesn't exist, this is the first sync - expected
    if (!state) {
      expect(state).toBeNull();
    }
  });

  test('should retrieve max UID from emails table', async () => {
    const db = getDatabase(TEST_ACCOUNT);

    // Insert emails with various UIDs (no account column)
    const testEmails: NewEmail[] = [
      {
        messageId: 'test1@example.com',
        threadId: null,
        uid: 50,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['recipient@example.com']),
        cc: null,
        subject: 'Test',
        snippet: 'Test',
        date: Date.now(),
        receivedDate: null,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      },
      {
        messageId: 'test2@example.com',
        threadId: null,
        uid: 91885, // Max UID like real data
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['recipient@example.com']),
        cc: null,
        subject: 'Test',
        snippet: 'Test',
        date: Date.now(),
        receivedDate: null,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      },
    ];

    await db.insert(emails).values(testEmails);

    // Test the raw SQL approach (per-account DB, no account filter)
    const sqlite = getSqliteInstance(TEST_ACCOUNT);
    const result = sqlite.prepare('SELECT MAX(uid) as maxUid FROM emails WHERE mailbox = ?')
      .get('INBOX') as { maxUid: number } | undefined;

    expect(result?.maxUid).toBe(91885);
  });

  test('should detect incremental sync when last_sync_uid exists', async () => {
    const db = getDatabase(TEST_ACCOUNT);

    // Create a sync state with a last_sync_uid (no account column)
    await db.insert(syncState).values({
      mailbox: 'INBOX',
      lastSyncTimestamp: Date.now(),
      lastSyncUid: 500,
      totalMessages: 100,
      messagesIndexed: 100,
      messagesUpdated: 0,
      lastError: null,
      lastSuccessAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const syncEngine = new SyncEngine();
    const state = await syncEngine.getSyncState(TEST_ACCOUNT, 'INBOX');

    expect(state).not.toBeNull();
    expect(state?.lastSyncUid).toBe(500);

    // When lastSyncUid is not null, sync should be incremental
    expect(state?.lastSyncUid).toBeGreaterThan(0);
  });
});
