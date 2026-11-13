/**
 * Email Database Schema
 * Per-account SQLite schema for email metadata indexing and analytics
 *
 * Note: No 'account' column needed - each account has its own database file
 */

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Emails table - stores email metadata for fast querying and analytics
 */
export const emails = sqliteTable('emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Email identifiers
  messageId: text('message_id').notNull(),
  threadId: text('thread_id'),
  uid: integer('uid').notNull(),

  // Mailbox (INBOX, Archive, Sent, etc.)
  mailbox: text('mailbox').notNull().default('INBOX'),

  // Email metadata
  from: text('from').notNull(),
  fromName: text('from_name'),
  to: text('to').notNull(), // JSON array
  cc: text('cc'), // JSON array
  subject: text('subject').notNull(),
  snippet: text('snippet'), // First 200 chars of body

  // Dates (Unix timestamps)
  date: integer('date').notNull(),
  receivedDate: integer('received_date'),

  // Priority and classification
  priority: integer('priority').notNull().default(50), // 0-100 score

  // Flags and status
  flags: text('flags'), // JSON array: ['\\Seen', '\\Flagged', etc]
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),

  // Attachments
  hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
  attachmentCount: integer('attachment_count').notNull().default(0),

  // Indexing metadata
  indexedAt: integer('indexed_at').notNull(), // Unix timestamp
  lastSyncedAt: integer('last_synced_at'), // Last time we updated this record
}, (table) => ({
  dateIdx: index('idx_date').on(table.date),
  priorityIdx: index('idx_priority').on(table.priority),
  fromIdx: index('idx_from').on(table.from),
  isReadIdx: index('idx_is_read').on(table.isRead),
  mailboxIdx: index('idx_mailbox').on(table.mailbox),
  // Unique constraint: same message can appear in different mailboxes
  uniqueMessageIdx: uniqueIndex('idx_unique_message').on(table.mailbox, table.messageId),
  // Unique UID per mailbox
  uniqueUidIdx: uniqueIndex('idx_uid_mailbox').on(table.uid, table.mailbox),
}));

/**
 * Email stats table - daily/weekly aggregated statistics
 */
export const emailStats = sqliteTable('email_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Period info
  date: text('date').notNull(), // YYYY-MM-DD
  period: text('period').notNull(), // 'day' | 'week' | 'month'

  // Volume stats
  totalReceived: integer('total_received').notNull().default(0),
  totalRead: integer('total_read').notNull().default(0),
  totalArchived: integer('total_archived').notNull().default(0),
  totalDeleted: integer('total_deleted').notNull().default(0),

  // Priority breakdown
  totalUrgent: integer('total_urgent').notNull().default(0),
  totalNormal: integer('total_normal').notNull().default(0),
  totalLow: integer('total_low').notNull().default(0),

  // Engagement
  responseRate: integer('response_rate').notNull().default(0), // Percentage (0-100)

  // Metadata
  calculatedAt: integer('calculated_at').notNull(),
}, (table) => ({
  datePeriodIdx: index('idx_date_period').on(table.date, table.period),
}));

/**
 * Sync state table - tracks incremental sync progress per mailbox
 */
export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Mailbox (unique per database/account)
  mailbox: text('mailbox').notNull().unique(),

  // Sync tracking
  lastSyncTimestamp: integer('last_sync_timestamp').notNull(),
  lastSyncUid: integer('last_sync_uid'), // Last UID synced from IMAP

  // Statistics
  totalMessages: integer('total_messages').notNull().default(0),
  messagesIndexed: integer('messages_indexed').notNull().default(0),
  messagesUpdated: integer('messages_updated').notNull().default(0),

  // Status
  lastError: text('last_error'),
  lastSuccessAt: integer('last_success_at'),

  // Metadata
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Type exports for use in application
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type EmailStats = typeof emailStats.$inferSelect;
export type NewEmailStats = typeof emailStats.$inferInsert;
export type SyncState = typeof syncState.$inferSelect;
export type NewSyncState = typeof syncState.$inferInsert;
