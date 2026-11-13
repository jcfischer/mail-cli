/**
 * Email Search Engine
 * Full-text search using SQLite FTS5 on per-account databases
 */

import { getSqliteInstance } from './client';
import type { Email } from './schema';

/**
 * Sanitize a query for FTS5 to prevent syntax errors from special characters.
 *
 * FTS5 special characters that can cause issues:
 * - `*` alone: "unknown special query" (only valid as suffix like `term*`)
 * - `.` : column separator syntax
 * - `+`, `-`, `OR`, `NOT`, `AND`: operators
 * - `"`, `(`, `)`, `^`, `:`: various FTS5 syntax
 *
 * Strategy: Double-quote each token to treat as literals, preserving multi-word search.
 */
function sanitizeFtsQuery(query: string): string | null {
  const trimmed = query.trim();

  // Handle wildcards: `*` alone or with whitespace means "match all"
  if (!trimmed || trimmed === '*') {
    return null; // Signal to skip FTS and return all
  }

  // Split into tokens and quote each one to escape special characters
  // This turns "pat.lee test" into '"pat.lee" "test"'
  const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);

  // Quote each token - this escapes dots, colons, etc.
  const quotedTokens = tokens.map(token => {
    // If token is already quoted, keep as-is
    if (token.startsWith('"') && token.endsWith('"')) {
      return token;
    }
    // Escape any internal quotes and wrap in quotes
    const escaped = token.replace(/"/g, '""');
    return `"${escaped}"`;
  });

  return quotedTokens.join(' ');
}

export interface SearchOptions {
  account: string;  // Required - specifies which account DB to search
  mailbox?: string;
  limit?: number;
  unread?: boolean;
  from?: string;    // Filter by sender email address (partial match)
  to?: string;      // Filter by recipient email address (partial match)
}

export interface SearchResult extends Omit<Email, 'account'> {
  account?: string; // Added back for compatibility with callers
}

/**
 * Search emails using FTS5 full-text search
 * If query is empty, returns all emails matching filters
 */
export async function searchEmails(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const sqlite = getSqliteInstance(options.account);
  const limit = options.limit || 20;

  let sqlQuery: string;
  const params: any[] = [];

  // Sanitize the query for FTS5 - returns null if should skip FTS (empty or "*")
  const sanitizedQuery = sanitizeFtsQuery(query);

  if (sanitizedQuery) {
    // FTS search with sanitized query
    sqlQuery = `
      SELECT e.*
      FROM emails e
      JOIN emails_fts fts ON e.id = fts.rowid
      WHERE emails_fts MATCH ?
    `;
    params.push(sanitizedQuery);
  } else {
    // No query or "*" - return all emails matching filters
    sqlQuery = `
      SELECT * FROM emails e
      WHERE 1=1
    `;
  }

  // Add filters (no account filter needed - DB is account-specific)
  if (options.mailbox) {
    sqlQuery += ' AND e.mailbox = ?';
    params.push(options.mailbox);
  }

  if (options.unread) {
    sqlQuery += ' AND e.is_read = 0';
  }

  // Filter by sender email address (partial match, case-insensitive)
  if (options.from) {
    sqlQuery += ' AND LOWER(e."from") LIKE LOWER(?)';
    params.push(`%${options.from}%`);
  }

  // Filter by recipient email address (partial match in JSON array, case-insensitive)
  if (options.to) {
    sqlQuery += ' AND LOWER(e."to") LIKE LOWER(?)';
    params.push(`%${options.to}%`);
  }

  sqlQuery += ' ORDER BY e.date DESC LIMIT ?';
  params.push(limit);

  // Execute search
  const stmt = sqlite.prepare(sqlQuery);
  const rawResults = stmt.all(...params) as any[];

  // Map snake_case database columns to camelCase TypeScript
  const results: SearchResult[] = rawResults.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    uid: row.uid,
    mailbox: row.mailbox,
    from: row.from,
    fromName: row.from_name,
    to: row.to,
    cc: row.cc,
    subject: row.subject,
    snippet: row.snippet,
    date: row.date,
    receivedDate: row.received_date,
    priority: row.priority,
    flags: row.flags,
    isRead: row.is_read,
    isStarred: row.is_starred,
    isArchived: row.is_archived,
    hasAttachments: row.has_attachments,
    attachmentCount: row.attachment_count,
    indexedAt: row.indexed_at,
    lastSyncedAt: row.last_synced_at,
    // Add account back for compatibility
    account: options.account,
  }));

  return results;
}

/**
 * Search across multiple accounts
 */
export async function searchEmailsAllAccounts(query: string, accounts: string[], options: Omit<SearchOptions, 'account'> = {}): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  for (const account of accounts) {
    const results = await searchEmails(query, { ...options, account });
    allResults.push(...results);
  }

  // Sort by date descending
  allResults.sort((a, b) => b.date - a.date);

  // Apply limit
  const limit = options.limit || 20;
  return allResults.slice(0, limit);
}

/**
 * Find email by messageId in a specific account
 */
export async function findEmailByMessageId(messageId: string, account: string): Promise<SearchResult | null> {
  const sqlite = getSqliteInstance(account);

  const sqlQuery = `
    SELECT * FROM emails
    WHERE message_id = ?
    LIMIT 1
  `;

  const stmt = sqlite.prepare(sqlQuery);
  const row = stmt.get(messageId) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    uid: row.uid,
    mailbox: row.mailbox,
    from: row.from,
    fromName: row.from_name,
    to: row.to,
    cc: row.cc,
    subject: row.subject,
    snippet: row.snippet,
    date: row.date,
    receivedDate: row.received_date,
    priority: row.priority,
    flags: row.flags,
    isRead: row.is_read,
    isStarred: row.is_starred,
    isArchived: row.is_archived,
    hasAttachments: row.has_attachments,
    attachmentCount: row.attachment_count,
    indexedAt: row.indexed_at,
    lastSyncedAt: row.last_synced_at,
    account,
  };
}

/**
 * Find email by messageId across all accounts
 */
export async function findEmailByMessageIdAllAccounts(messageId: string, accounts: string[]): Promise<SearchResult | null> {
  for (const account of accounts) {
    const result = await findEmailByMessageId(messageId, account);
    if (result) {
      return result;
    }
  }
  return null;
}
