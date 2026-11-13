/**
 * Email Search Tests
 * Tests for per-account database pattern
 */

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { searchEmails, searchEmailsAllAccounts } from '../src/db/search';
import { getDatabase, closeDatabase, getSqliteInstance } from '../src/db/client';
import { emails, type NewEmail } from '../src/db/schema';

// Use test-specific accounts
const TEST_ACCOUNT_1 = 'test-search-1';
const TEST_ACCOUNT_2 = 'test-search-2';

describe('Email Search (Per-Account)', () => {
  beforeEach(async () => {
    // Clean up test data in each test account
    const db1 = getDatabase(TEST_ACCOUNT_1);
    const db2 = getDatabase(TEST_ACCOUNT_2);
    await db1.delete(emails);
    await db2.delete(emails);
  });

  afterAll(() => {
    // Close test databases
    closeDatabase(TEST_ACCOUNT_1);
    closeDatabase(TEST_ACCOUNT_2);
  });

  test('should search emails by subject in account database', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    // Insert test emails (no account column - DB is account-specific)
    await db.insert(emails).values([
      {
        messageId: 'test1',
        uid: 1,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        to: JSON.stringify(['recipient@example.com']),
        subject: 'Invoice for services',
        snippet: 'Please find attached invoice INV-001',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 1,
        attachmentCount: 1,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'test2',
        uid: 2,
        mailbox: 'INBOX',
        from: 'sender2@example.com',
        fromName: 'Another Sender',
        to: JSON.stringify(['recipient@example.com']),
        subject: 'Meeting notes',
        snippet: 'Notes from yesterday meeting',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    const results = await searchEmails('invoice', { account: TEST_ACCOUNT_1, limit: 10 });

    expect(results.length).toBe(1);
    expect(results[0].subject).toContain('Invoice');
  });

  test('should search across multiple accounts using searchEmailsAllAccounts', async () => {
    const db1 = getDatabase(TEST_ACCOUNT_1);
    const db2 = getDatabase(TEST_ACCOUNT_2);

    // Insert into account 1
    await db1.insert(emails).values({
      messageId: 'test3',
      uid: 3,
      mailbox: 'INBOX',
      from: 'friend@example.com',
      fromName: 'Friend',
      to: JSON.stringify(['me@example.com']),
      subject: 'Test message personal',
      snippet: 'Hello from personal account',
      date: Date.now(),
      priority: 50,
      flags: JSON.stringify([]),
      isRead: 0,
      isStarred: 0,
      isArchived: 0,
      hasAttachments: 0,
      attachmentCount: 0,
      indexedAt: Date.now(),
      lastSyncedAt: Date.now(),
    } as NewEmail);

    // Insert into account 2
    await db2.insert(emails).values({
      messageId: 'test4',
      uid: 4,
      mailbox: 'INBOX',
      from: 'colleague@work.com',
      fromName: 'Colleague',
      to: JSON.stringify(['me@work.com']),
      subject: 'Test message work',
      snippet: 'Hello from work account',
      date: Date.now(),
      priority: 50,
      flags: JSON.stringify([]),
      isRead: 0,
      isStarred: 0,
      isArchived: 0,
      hasAttachments: 0,
      attachmentCount: 0,
      indexedAt: Date.now(),
      lastSyncedAt: Date.now(),
    } as NewEmail);

    // Search across both accounts
    const results = await searchEmailsAllAccounts('Test', [TEST_ACCOUNT_1, TEST_ACCOUNT_2], { limit: 10 });

    expect(results.length).toBe(2);
  });

  test('should filter by unread status', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'test5',
        uid: 5,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['me@example.com']),
        subject: 'Unread message',
        snippet: 'This is unread',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'test6',
        uid: 6,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['me@example.com']),
        subject: 'Read message',
        snippet: 'This is read',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 1,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    const results = await searchEmails('message', { account: TEST_ACCOUNT_1, unread: true, limit: 10 });

    expect(results.length).toBe(1);
    expect(results[0].isRead).toBe(0);
  });

  test('should respect limit', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    // Insert multiple emails
    const testEmails: NewEmail[] = [];
    for (let i = 0; i < 20; i++) {
      testEmails.push({
        messageId: `test${i}`,
        uid: i,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['me@example.com']),
        subject: `Test email ${i}`,
        snippet: `Content of test email ${i}`,
        date: Date.now() - i * 1000,
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail);
    }
    await db.insert(emails).values(testEmails);

    const results = await searchEmails('Test', { account: TEST_ACCOUNT_1, limit: 5 });

    expect(results.length).toBe(5);
  });

  test('should return all emails when query is empty', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'empty-query-1',
        uid: 100,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['me@example.com']),
        subject: 'First email',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'empty-query-2',
        uid: 101,
        mailbox: 'INBOX',
        from: 'other@example.com',
        fromName: 'Other',
        to: JSON.stringify(['me@example.com']),
        subject: 'Second email',
        snippet: 'More content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Empty query should return all emails
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, limit: 10 });

    expect(results.length).toBe(2);
  });

  test('should filter by sender email address (from)', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'from-filter-1',
        uid: 200,
        mailbox: 'INBOX',
        from: 'alice@company.com',
        fromName: 'Alice',
        to: JSON.stringify(['me@example.com']),
        subject: 'Message from Alice',
        snippet: 'Hello from Alice',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'from-filter-2',
        uid: 201,
        mailbox: 'INBOX',
        from: 'bob@other.org',
        fromName: 'Bob',
        to: JSON.stringify(['me@example.com']),
        subject: 'Message from Bob',
        snippet: 'Hello from Bob',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Filter by from: alice@company.com
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, from: 'alice@company.com', limit: 10 });

    expect(results.length).toBe(1);
    expect(results[0].from).toBe('alice@company.com');
  });

  test('should filter by sender domain (partial from match)', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'from-domain-1',
        uid: 210,
        mailbox: 'INBOX',
        from: 'user1@acme.example',
        fromName: 'User 1',
        to: JSON.stringify(['me@example.com']),
        subject: 'From Acme 1',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'from-domain-2',
        uid: 211,
        mailbox: 'INBOX',
        from: 'user2@acme.example',
        fromName: 'User 2',
        to: JSON.stringify(['me@example.com']),
        subject: 'From Acme 2',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'from-domain-3',
        uid: 212,
        mailbox: 'INBOX',
        from: 'user@example.net',
        fromName: 'Example Net User',
        to: JSON.stringify(['me@example.com']),
        subject: 'From Example Net',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Filter by domain only
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, from: 'acme.example', limit: 10 });

    expect(results.length).toBe(2);
    expect(results.every(r => r.from.includes('acme.example'))).toBe(true);
  });

  test('should filter by recipient email address (to)', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'to-filter-1',
        uid: 220,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['alice@company.com', 'bob@company.com']),
        subject: 'Email to Alice and Bob',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'to-filter-2',
        uid: 221,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['charlie@other.org']),
        subject: 'Email to Charlie',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Filter by to: alice@company.com
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, to: 'alice@company.com', limit: 10 });

    expect(results.length).toBe(1);
    expect(results[0].to).toContain('alice@company.com');
  });

  test('should combine from and to filters', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'combo-filter-1',
        uid: 230,
        mailbox: 'INBOX',
        from: 'alice@company.com',
        fromName: 'Alice',
        to: JSON.stringify(['me@example.com']),
        subject: 'From Alice to me',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'combo-filter-2',
        uid: 231,
        mailbox: 'INBOX',
        from: 'alice@company.com',
        fromName: 'Alice',
        to: JSON.stringify(['other@example.com']),
        subject: 'From Alice to other',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'combo-filter-3',
        uid: 232,
        mailbox: 'INBOX',
        from: 'bob@company.com',
        fromName: 'Bob',
        to: JSON.stringify(['me@example.com']),
        subject: 'From Bob to me',
        snippet: 'Content',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Filter by both from and to
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, from: 'alice', to: 'me@example.com', limit: 10 });

    expect(results.length).toBe(1);
    expect(results[0].from).toBe('alice@company.com');
    expect(results[0].to).toContain('me@example.com');
  });

  test('should be case-insensitive for from/to filters', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values({
      messageId: 'case-insensitive-1',
      uid: 240,
      mailbox: 'INBOX',
      from: 'Alice.Smith@Company.COM',
      fromName: 'Alice Smith',
      to: JSON.stringify(['Me@Example.COM']),
      subject: 'Case insensitive test',
      snippet: 'Content',
      date: Date.now(),
      priority: 50,
      flags: JSON.stringify([]),
      isRead: 0,
      isStarred: 0,
      isArchived: 0,
      hasAttachments: 0,
      attachmentCount: 0,
      indexedAt: Date.now(),
      lastSyncedAt: Date.now(),
    } as NewEmail);

    // Search with lowercase
    const results = await searchEmails('', { account: TEST_ACCOUNT_1, from: 'alice.smith@company.com', limit: 10 });

    expect(results.length).toBe(1);
  });

  test('should handle wildcard "*" as match-all query', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'wildcard-1',
        uid: 250,
        mailbox: 'INBOX',
        from: 'sender@example.com',
        fromName: 'Sender',
        to: JSON.stringify(['me@example.com']),
        subject: 'First message',
        snippet: 'Content one',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'wildcard-2',
        uid: 251,
        mailbox: 'Sent',
        from: 'me@example.com',
        fromName: 'Me',
        to: JSON.stringify(['other@example.com']),
        subject: 'Second message',
        snippet: 'Content two',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // "*" should return all emails (with optional filters)
    const allResults = await searchEmails('*', { account: TEST_ACCOUNT_1, limit: 10 });
    expect(allResults.length).toBe(2);

    // "*" with mailbox filter
    const sentResults = await searchEmails('*', { account: TEST_ACCOUNT_1, mailbox: 'Sent', limit: 10 });
    expect(sentResults.length).toBe(1);
    expect(sentResults[0].mailbox).toBe('Sent');
  });

  test('should handle query with dots (email addresses)', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values([
      {
        messageId: 'dots-1',
        uid: 260,
        mailbox: 'INBOX',
        from: 'pat.lee@example.org',
        fromName: 'Pat Lee',
        to: JSON.stringify(['me@example.com']),
        subject: 'Email from Martin',
        snippet: 'Hello from pat.lee@example.org',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
      {
        messageId: 'dots-2',
        uid: 261,
        mailbox: 'INBOX',
        from: 'john.doe@company.com',
        fromName: 'John Doe',
        to: JSON.stringify(['me@example.com']),
        subject: 'Email from John',
        snippet: 'Hello from John',
        date: Date.now(),
        priority: 50,
        flags: JSON.stringify([]),
        isRead: 0,
        isStarred: 0,
        isArchived: 0,
        hasAttachments: 0,
        attachmentCount: 0,
        indexedAt: Date.now(),
        lastSyncedAt: Date.now(),
      } as NewEmail,
    ]);

    // Query with dots should not cause FTS5 syntax error
    const results = await searchEmails('pat.lee', { account: TEST_ACCOUNT_1, limit: 10 });
    expect(results.length).toBe(1);
    expect(results[0].from).toBe('pat.lee@example.org');
  });

  test('should handle query with special FTS5 characters', async () => {
    const db = getDatabase(TEST_ACCOUNT_1);

    await db.insert(emails).values({
      messageId: 'special-chars-1',
      uid: 270,
      mailbox: 'INBOX',
      from: 'sender@example.com',
      fromName: 'Sender',
      to: JSON.stringify(['me@example.com']),
      subject: 'Test with special characters',
      snippet: 'Content with colons: and (parentheses) and "quotes"',
      date: Date.now(),
      priority: 50,
      flags: JSON.stringify([]),
      isRead: 0,
      isStarred: 0,
      isArchived: 0,
      hasAttachments: 0,
      attachmentCount: 0,
      indexedAt: Date.now(),
      lastSyncedAt: Date.now(),
    } as NewEmail);

    // These queries should not cause FTS5 syntax errors
    const results1 = await searchEmails('user:value', { account: TEST_ACCOUNT_1, limit: 10 });
    expect(Array.isArray(results1)).toBe(true);

    const results2 = await searchEmails('test (query)', { account: TEST_ACCOUNT_1, limit: 10 });
    expect(Array.isArray(results2)).toBe(true);

    const results3 = await searchEmails('hello+world', { account: TEST_ACCOUNT_1, limit: 10 });
    expect(Array.isArray(results3)).toBe(true);
  });
});
