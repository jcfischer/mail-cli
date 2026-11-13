/**
 * Email Sync Engine
 * Orchestrates incremental sync from IMAP to per-account SQLite database
 */

import { getDatabase, getSqliteInstance } from '../db/client';
import { syncState, type NewSyncState } from '../db/schema';
import { EmailIndexer } from '../db/indexer';
import { ImapClient, createImapConfig } from '../imap/client';
import type { EmailAccount } from '../types';
import { eq } from 'drizzle-orm';

export interface SyncOptions {
  account: string;
  accountConfig: EmailAccount;
  mailboxes?: string[]; // Defaults to ['INBOX', 'Archive', 'Sent']
  full?: boolean; // If true, re-sync all emails (ignores lastSyncUid)
  verbose?: boolean; // If true, show detailed progress
}

export interface SyncResult {
  account: string;
  results: MailboxSyncResult[];
  totalIndexed: number;
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
  duration: number;
}

export interface MailboxSyncResult {
  mailbox: string;
  indexed: number;
  updated: number;
  skipped: number;
  errors: number;
  lastUid: number | null;
}

export class SyncEngine {
  /**
   * Sync email account (all configured mailboxes)
   */
  async syncAccount(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    // Priority: CLI override > config file > default
    const mailboxes = options.mailboxes
      || options.accountConfig.imap?.mailboxes
      || ['INBOX', 'Archive', 'Sent'];
    const verbose = options.verbose || false;

    console.log(`\n📧 Syncing account: ${options.account}`);
    console.log(`📁 Mailboxes: ${mailboxes.join(', ')}\n`);

    const results: MailboxSyncResult[] = [];
    let totalIndexed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Create IMAP client
    const imapConfig = createImapConfig(options.accountConfig);
    const client = new ImapClient(imapConfig);
    // Pass account name to indexer for per-account DB
    const indexer = new EmailIndexer(client, options.account);

    try {
      // Connect once for all mailboxes
      if (verbose) {
        console.log(`🔌 Connecting to IMAP server...`);
      }
      await client.connect();
      if (verbose) {
        console.log(`✅ Connected to ${imapConfig.host}:${imapConfig.port}\n`);
      }

      // Sync each mailbox
      for (const mailbox of mailboxes) {
        const mailboxResult = await this.syncMailbox({
          account: options.account,
          mailbox,
          client,
          indexer,
          full: options.full || false,
          verbose,
        });

        results.push(mailboxResult);
        totalIndexed += mailboxResult.indexed;
        totalUpdated += mailboxResult.updated;
        totalSkipped += mailboxResult.skipped;
        totalErrors += mailboxResult.errors;

        console.log(`✅ ${mailbox}: ${mailboxResult.indexed} new, ${mailboxResult.updated} updated, ${mailboxResult.skipped} skipped\n`);
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      throw error;
    } finally {
      // Disconnect after all mailboxes are synced
      if (verbose) {
        console.log(`🔌 Disconnecting from IMAP server...`);
      }
      await client.disconnect();
      if (verbose) {
        console.log(`✅ Disconnected\n`);
      }
    }

    const duration = Date.now() - startTime;

    return {
      account: options.account,
      results,
      totalIndexed,
      totalUpdated,
      totalSkipped,
      totalErrors,
      duration,
    };
  }

  /**
   * Sync a single mailbox (with incremental logic)
   */
  private async syncMailbox(options: {
    account: string;
    mailbox: string;
    client: ImapClient;
    indexer: EmailIndexer;
    full: boolean;
    verbose: boolean;
  }): Promise<MailboxSyncResult> {
    const { account, mailbox, client, indexer, full, verbose } = options;

    console.log(`📂 Syncing ${mailbox}...`);

    // Get sync state for this mailbox (from account-specific DB)
    const state = await this.getSyncState(account, mailbox);

    let lastUid = state?.lastSyncUid || null;
    let since: Date | undefined;

    // For incremental sync, use lastSyncUid
    if (!full && lastUid) {
      console.log(`   📍 Incremental sync from UID ${lastUid}`);
      if (verbose) {
        const lastSyncDate = new Date(state!.lastSyncTimestamp).toLocaleString();
        console.log(`   ⏰ Last synced: ${lastSyncDate}`);
      }
      // We'll fetch messages with UID > lastUid by using a recent date filter
      // (IMAP doesn't support UID range in search criteria directly)
      since = new Date(state!.lastSyncTimestamp);
    } else {
      console.log(`   🔄 Full sync (${full ? 'forced' : 'first run'})`);
    }

    // Index emails
    const result = await indexer.indexEmails({
      account,
      mailbox,
      limit: 0, // No limit - fetch all matching
      since,
      full,
      verbose,
    });

    // Get highest UID from indexed emails using raw SQL (account-specific DB)
    const sqlite = getSqliteInstance(account);
    const maxUidResult = sqlite.prepare('SELECT MAX(uid) as maxUid FROM emails WHERE mailbox = ?')
      .get(mailbox) as { maxUid: number | null } | undefined;

    const newLastUid = maxUidResult?.maxUid || lastUid;

    // Update sync state
    await this.updateSyncState(account, mailbox, {
      lastSyncUid: newLastUid,
      messagesIndexed: result.indexed,
      messagesUpdated: result.updated,
      totalMessages: (state?.totalMessages || 0) + result.indexed,
      lastError: result.errors > 0 ? `${result.errors} errors` : null,
    });

    return {
      mailbox,
      indexed: result.indexed,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
      lastUid: newLastUid,
    };
  }

  /**
   * Get sync state for mailbox (from account-specific DB)
   */
  async getSyncState(account: string, mailbox: string) {
    const sqlite = getSqliteInstance(account);
    const state = sqlite.prepare(`
      SELECT * FROM sync_state
      WHERE mailbox = ?
      LIMIT 1
    `).get(mailbox) as any;

    if (!state) return null;

    // Map snake_case to camelCase
    return {
      id: state.id,
      mailbox: state.mailbox,
      lastSyncTimestamp: state.last_sync_timestamp,
      lastSyncUid: state.last_sync_uid,
      totalMessages: state.total_messages,
      messagesIndexed: state.messages_indexed,
      messagesUpdated: state.messages_updated,
      lastError: state.last_error,
      lastSuccessAt: state.last_success_at,
      createdAt: state.created_at,
      updatedAt: state.updated_at,
    };
  }

  /**
   * Update sync state (in account-specific DB)
   */
  private async updateSyncState(
    account: string,
    mailbox: string,
    updates: {
      lastSyncUid: number | null;
      messagesIndexed: number;
      messagesUpdated: number;
      totalMessages: number;
      lastError: string | null;
    }
  ) {
    const db = getDatabase(account);
    const existing = await this.getSyncState(account, mailbox);
    const now = Date.now();

    if (existing) {
      // Update existing state
      await db.update(syncState)
        .set({
          lastSyncTimestamp: now,
          lastSyncUid: updates.lastSyncUid,
          messagesIndexed: updates.messagesIndexed,
          messagesUpdated: updates.messagesUpdated,
          totalMessages: updates.totalMessages,
          lastError: updates.lastError,
          lastSuccessAt: updates.lastError ? existing.lastSuccessAt : now,
          updatedAt: now,
        })
        .where(eq(syncState.mailbox, mailbox));
    } else {
      // Create new state
      const newState: NewSyncState = {
        mailbox,
        lastSyncTimestamp: now,
        lastSyncUid: updates.lastSyncUid,
        totalMessages: updates.totalMessages,
        messagesIndexed: updates.messagesIndexed,
        messagesUpdated: updates.messagesUpdated,
        lastError: updates.lastError,
        lastSuccessAt: updates.lastError ? null : now,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(syncState).values(newState);
    }
  }

  /**
   * Get sync status for an account
   */
  async getSyncStatusForAccount(account: string) {
    const db = getDatabase(account);
    const allStates = await db.query.syncState.findMany({
      orderBy: (syncState, { desc }) => [desc(syncState.lastSyncTimestamp)],
    });

    return allStates.map(state => ({ ...state, account }));
  }

  /**
   * Get sync status for all accounts
   */
  async getSyncStatus(accounts: string[]) {
    const allStates: any[] = [];

    for (const account of accounts) {
      const states = await this.getSyncStatusForAccount(account);
      allStates.push(...states);
    }

    // Sort by timestamp
    allStates.sort((a, b) => b.lastSyncTimestamp - a.lastSyncTimestamp);
    return allStates;
  }

  /**
   * Reset sync state (forces full resync)
   */
  async resetSyncState(account: string, mailbox?: string): Promise<void> {
    const db = getDatabase(account);

    if (mailbox) {
      // Reset specific mailbox
      await db.delete(syncState)
        .where(eq(syncState.mailbox, mailbox));
    } else {
      // Reset entire account - delete all sync states
      const sqlite = getSqliteInstance(account);
      sqlite.run('DELETE FROM sync_state');
    }
  }
}

// Export SyncState type
export type { SyncState } from '../db/schema';
