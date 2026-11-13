/**
 * Email Database Client
 * Per-account SQLite databases (like tana workspaces)
 *
 * Each account gets its own database: ~/.config/email/email-{account}.db
 */

import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Database location: ~/.config/email/
const CONFIG_DIR = join(homedir(), '.config', 'email');

// Ensure config directory exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

// Cache for open database connections
const dbCache = new Map<string, { sqlite: Database; drizzle: BunSQLiteDatabase<typeof schema> }>();

/**
 * Get database path for an account
 */
export function getDbPath(account: string): string {
  return join(CONFIG_DIR, `email-${account}.db`);
}

/**
 * Initialize database schema for an account
 */
function initDatabase(sqlite: Database): void {
  // Enable WAL mode for better concurrency
  sqlite.run('PRAGMA journal_mode = WAL');

  // Create emails table - no account column needed (DB is account-specific)
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT,
      uid INTEGER NOT NULL,
      mailbox TEXT NOT NULL DEFAULT 'INBOX',
      "from" TEXT NOT NULL,
      from_name TEXT,
      "to" TEXT NOT NULL,
      cc TEXT,
      subject TEXT NOT NULL,
      snippet TEXT,
      date INTEGER NOT NULL,
      received_date INTEGER,
      priority INTEGER NOT NULL DEFAULT 50,
      flags TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      attachment_count INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL,
      last_synced_at INTEGER
    )
  `);

  // Create indexes for emails table
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_date ON emails(date)');
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_priority ON emails(priority)');
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_from ON emails("from")');
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_is_read ON emails(is_read)');
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_mailbox ON emails(mailbox)');
  sqlite.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_uid_mailbox ON emails(uid, mailbox)');

  // Create email_stats table
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS email_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      total_received INTEGER NOT NULL DEFAULT 0,
      total_read INTEGER NOT NULL DEFAULT 0,
      total_archived INTEGER NOT NULL DEFAULT 0,
      total_deleted INTEGER NOT NULL DEFAULT 0,
      total_urgent INTEGER NOT NULL DEFAULT 0,
      total_normal INTEGER NOT NULL DEFAULT 0,
      total_low INTEGER NOT NULL DEFAULT 0,
      response_rate INTEGER NOT NULL DEFAULT 0,
      calculated_at INTEGER NOT NULL
    )
  `);

  // Create indexes for email_stats table
  sqlite.run('CREATE INDEX IF NOT EXISTS idx_date_period ON email_stats(date, period)');

  // Create sync_state table - no account column needed
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mailbox TEXT NOT NULL UNIQUE,
      last_sync_timestamp INTEGER NOT NULL,
      last_sync_uid INTEGER,
      total_messages INTEGER NOT NULL DEFAULT 0,
      messages_indexed INTEGER NOT NULL DEFAULT 0,
      messages_updated INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_success_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Create FTS5 virtual table for full-text search
  sqlite.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
      message_id,
      subject,
      snippet,
      "from",
      from_name,
      content=emails,
      content_rowid=id
    )
  `);

  // Create triggers to keep FTS index in sync with emails table
  sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
      INSERT INTO emails_fts(rowid, message_id, subject, snippet, "from", from_name)
      VALUES (new.id, new.message_id, new.subject, new.snippet, new."from", new.from_name);
    END
  `);

  sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
      DELETE FROM emails_fts WHERE rowid = old.id;
    END
  `);

  sqlite.run(`
    CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
      UPDATE emails_fts SET
        message_id = new.message_id,
        subject = new.subject,
        snippet = new.snippet,
        "from" = new."from",
        from_name = new.from_name
      WHERE rowid = new.id;
    END
  `);
}

/**
 * Get or create database for an account
 */
export function getDatabase(account: string): BunSQLiteDatabase<typeof schema> {
  const cached = dbCache.get(account);
  if (cached) {
    return cached.drizzle;
  }

  const dbPath = getDbPath(account);
  const sqlite = new Database(dbPath, { create: true });
  initDatabase(sqlite);

  const drizzleDb = drizzle(sqlite, { schema });
  dbCache.set(account, { sqlite, drizzle: drizzleDb });

  return drizzleDb;
}

/**
 * Get raw SQLite instance for custom queries (e.g., FTS5)
 */
export function getSqliteInstance(account: string): Database {
  const cached = dbCache.get(account);
  if (cached) {
    return cached.sqlite;
  }

  // Initialize database to populate cache
  getDatabase(account);
  return dbCache.get(account)!.sqlite;
}

/**
 * Get database statistics for an account
 */
export function getDatabaseStats(account: string) {
  const sqlite = getSqliteInstance(account);
  const dbPath = getDbPath(account);

  const emailCount = sqlite.prepare('SELECT COUNT(*) as count FROM emails').get() as { count: number } | null;
  const statsCount = sqlite.prepare('SELECT COUNT(*) as count FROM email_stats').get() as { count: number } | null;
  const dbSize = sqlite.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number } | null;

  return {
    emailCount: emailCount?.count || 0,
    statsCount: statsCount?.count || 0,
    dbSize: dbSize?.size || 0,
    dbPath,
  };
}

/**
 * Get statistics across all accounts
 */
export function getAllDatabaseStats(accounts: string[]) {
  let totalEmails = 0;
  let totalStats = 0;
  let totalSize = 0;
  const perAccount: Record<string, { emailCount: number; dbPath: string }> = {};

  for (const account of accounts) {
    const dbPath = getDbPath(account);
    if (!existsSync(dbPath)) continue;

    const stats = getDatabaseStats(account);
    totalEmails += stats.emailCount;
    totalStats += stats.statsCount;
    totalSize += stats.dbSize;
    perAccount[account] = { emailCount: stats.emailCount, dbPath: stats.dbPath };
  }

  return {
    totalEmails,
    totalStats,
    totalSize,
    perAccount,
    configDir: CONFIG_DIR,
  };
}

/**
 * Close database connection for an account
 */
export function closeDatabase(account: string): void {
  const cached = dbCache.get(account);
  if (cached) {
    cached.sqlite.close();
    dbCache.delete(account);
  }
}

/**
 * Close all database connections
 */
export function closeAllDatabases(): void {
  for (const [account, { sqlite }] of dbCache) {
    sqlite.close();
  }
  dbCache.clear();
}

/**
 * List all account databases
 */
export function listAccountDatabases(): string[] {
  const files = require('fs').readdirSync(CONFIG_DIR) as string[];
  return files
    .filter((f: string) => f.startsWith('email-') && f.endsWith('.db'))
    .map((f: string) => f.replace('email-', '').replace('.db', ''));
}
