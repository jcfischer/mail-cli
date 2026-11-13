/**
 * Email Indexer
 * Syncs emails from IMAP to per-account SQLite database
 */

import { getDatabase } from './client';
import { emails, type NewEmail } from './schema';
import { ImapClient } from '../imap/client';
import type { EmailMessage } from '../types';
import { eq, and, sql } from 'drizzle-orm';
import { calculatePriority } from '../filtering/priority';

export interface IndexOptions {
  account: string;
  mailbox?: string;
  limit?: number;
  since?: Date;
  full?: boolean; // If true, re-index all emails (slow)
  verbose?: boolean; // If true, show detailed progress
}

export interface IndexResult {
  indexed: number;
  updated: number;
  skipped: number;
  errors: number;
  duration: number;
}

export class EmailIndexer {
  private client: ImapClient;
  private account: string;

  constructor(client: ImapClient, account: string) {
    this.client = client;
    this.account = account;
  }

  /**
   * Get database for this indexer's account
   */
  private get db() {
    return getDatabase(this.account);
  }

  /**
   * Index emails from IMAP to database
   * Note: Connection should be managed by caller (e.g., SyncEngine)
   */
  async indexEmails(options: IndexOptions): Promise<IndexResult> {
    const startTime = Date.now();
    const verbose = options.verbose || false;
    const mailbox = options.mailbox || 'INBOX';
    const result: IndexResult = {
      indexed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
    };

    try {
      // Fetch messages from IMAP (connection already established by caller)
      if (verbose) {
        console.log(`   🔍 Fetching messages from ${mailbox}...`);
      }

      const messages = await this.client.fetchMessages({
        mailbox,
        limit: options.limit || 0, // 0 = no limit
        since: options.since,
      });

      console.log(`   📨 Fetched ${messages.length} messages from IMAP`);

      // Process each message
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];

        try {
          // Check if email already exists (check mailbox + message_id)
          const existing = await this.db.query.emails.findFirst({
            where: and(
              eq(emails.messageId, message.messageId),
              eq(emails.mailbox, mailbox)
            ),
          });

          if (existing && !options.full) {
            // Update existing record if flags changed
            const flagsChanged = JSON.stringify(existing.flags) !== JSON.stringify(Array.from(message.flags || []));

            if (flagsChanged) {
              await this.updateEmail(existing.id, message);
              result.updated++;
              if (verbose) {
                console.log(`   [${i + 1}/${messages.length}] 🔄 Updated: ${message.subject?.substring(0, 50) || 'No subject'}...`);
              }
            } else {
              result.skipped++;
              if (verbose) {
                console.log(`   [${i + 1}/${messages.length}] ⏭️  Skipped: ${message.subject?.substring(0, 50) || 'No subject'}...`);
              }
            }
          } else {
            // Insert new email
            await this.insertEmail(message, mailbox);
            result.indexed++;
            if (verbose) {
              const fromStr = message.from.substring(0, 30);
              console.log(`   [${i + 1}/${messages.length}] ➕ New: ${message.subject?.substring(0, 40) || 'No subject'}... (from: ${fromStr})`);
            }
          }

          // Progress indicator (every 100 emails) - only when not verbose
          if (!verbose && (result.indexed + result.updated + result.skipped) % 100 === 0) {
            console.log(`   Progress: ${result.indexed} new, ${result.updated} updated, ${result.skipped} skipped`);
          }
        } catch (error) {
          console.error(`   ❌ Error indexing email ${message.messageId}:`, error);
          result.errors++;
        }
      }

      if (verbose && messages.length > 0) {
        console.log(`   ✅ Processed ${messages.length} messages`);
      }

    } catch (error) {
      console.error('Indexing error:', error);
      throw error;
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Insert new email into database
   * Uses ON CONFLICT DO UPDATE to handle duplicate message_ids gracefully
   */
  private async insertEmail(message: EmailMessage, mailbox: string): Promise<'inserted' | 'updated'> {
    // Calculate priority score (extract just the score number)
    const priorityResult = calculatePriority(message, []);
    const priority = priorityResult.score;

    // Parse flags
    const flags = Array.from(message.flags || []);
    const isRead = flags.includes('\\Seen');
    const isStarred = flags.includes('\\Flagged');
    const isArchived = mailbox.toLowerCase() !== 'inbox';

    // Parse from field to extract name and email
    // Format can be "Name <email>" or just "email"
    const fromMatch = message.from.match(/^(?:(.+?)\s*<)?([^>]+?)>?$/);
    const fromEmail = fromMatch ? fromMatch[2].trim() : message.from;
    const fromName = fromMatch && fromMatch[1] ? fromMatch[1].trim() : null;

    // Create email record - no account field needed (DB is account-specific)
    const newEmail: NewEmail = {
      messageId: message.messageId,
      threadId: null,
      uid: message.uid,
      mailbox,
      from: fromEmail,
      fromName,
      to: JSON.stringify(message.to),
      cc: null,
      subject: message.subject,
      snippet: message.snippet?.substring(0, 200) || null,
      date: message.date.getTime(),
      receivedDate: null,
      priority,
      flags: JSON.stringify(flags),
      isRead,
      isStarred,
      isArchived,
      hasAttachments: Boolean(message.hasAttachments),
      attachmentCount: message.hasAttachments ? 1 : 0,
      indexedAt: Date.now(),
      lastSyncedAt: Date.now(),
    };

    // Use ON CONFLICT to handle duplicate message_ids gracefully
    // This can happen when the same email appears in multiple mailboxes
    // or during re-syncs where the duplicate check didn't find it
    const result = await this.db.insert(emails)
      .values(newEmail)
      .onConflictDoUpdate({
        target: emails.messageId,
        set: {
          flags: sql`excluded.flags`,
          isRead: sql`excluded.is_read`,
          isStarred: sql`excluded.is_starred`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      });

    // Check if it was an insert or update by looking at changes
    // In SQLite, INSERT OR REPLACE counts as 1 change for both cases
    // We can't easily distinguish, so assume insert (caller handles stats)
    return 'inserted';
  }

  /**
   * Update existing email in database
   */
  private async updateEmail(id: number, message: EmailMessage): Promise<void> {
    const flags = message.flags || [];
    const isRead = flags.includes('\\Seen');
    const isStarred = flags.includes('\\Flagged');

    await this.db.update(emails)
      .set({
        flags: JSON.stringify(flags),
        isRead,
        isStarred,
        lastSyncedAt: Date.now(),
      })
      .where(eq(emails.id, id));
  }

  /**
   * Get last indexed date for incremental sync
   */
  async getLastIndexedDate(mailbox: string = 'INBOX'): Promise<Date | null> {
    const result = await this.db.query.emails.findFirst({
      where: eq(emails.mailbox, mailbox),
      orderBy: (emails, { desc }) => [desc(emails.indexedAt)],
    });

    return result ? new Date(result.indexedAt) : null;
  }

  /**
   * Delete emails from database (when deleted from IMAP)
   */
  async deleteEmails(messageIds: string[]): Promise<number> {
    // Note: drizzle's inArray isn't working well, use raw query via db
    let deleted = 0;
    for (const messageId of messageIds) {
      const removed = await this.db.delete(emails)
        .where(eq(emails.messageId, messageId))
        .returning({ messageId: emails.messageId });
      deleted += removed.length;
    }
    return deleted;
  }
}
