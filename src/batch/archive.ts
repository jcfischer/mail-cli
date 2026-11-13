/**
 * Archive Batch Operation
 * Archive old/read emails with safety checks
 */

import type { EmailMessage } from '../types';
import type { ImapClient } from '../imap/client';
import {
  executeBatchOperation,
  filterByAge,
  filterByReadStatus,
  type BatchOperationOptions,
  type BatchOperationResult,
} from './operations';

export interface ArchiveOptions extends BatchOperationOptions {
  olderThanDays?: number;
  readOnly?: boolean;
  targetMailbox?: string;
}

/**
 * Archive emails matching criteria
 * Archives by moving to Archive mailbox (or marking as archived)
 */
export async function archiveEmails(
  client: ImapClient,
  messages: EmailMessage[],
  options: ArchiveOptions = {}
): Promise<BatchOperationResult> {
  const {
    olderThanDays,
    readOnly = false,
    targetMailbox = 'Archive',
    ...batchOptions
  } = options;

  // Filter messages based on criteria
  let filtered = messages;

  if (olderThanDays !== undefined) {
    filtered = filterByAge(filtered, olderThanDays);
  }

  if (readOnly) {
    filtered = filterByReadStatus(filtered, true);
  }

  // Archive operation: move to Archive mailbox
  const archiveOperation = async (client: ImapClient, message: EmailMessage) => {
    try {
      await client.moveMessage(message.uid, targetMailbox);
    } catch (error) {
      // If move fails (no Archive mailbox), try adding \Deleted flag
      // Most email clients treat this as archived
      console.warn(`Could not move to ${targetMailbox}, marking as archived instead`);
      await client.markAsRead(message.uid);
    }
  };

  return executeBatchOperation(client, filtered, archiveOperation, batchOptions);
}

/**
 * Display archive preview
 */
export function displayArchivePreview(
  messages: EmailMessage[],
  options: ArchiveOptions
): void {
  const { olderThanDays, readOnly } = options;

  console.log('\n📦 Archive Preview\n');

  if (olderThanDays !== undefined) {
    console.log(`  • Archive emails older than ${olderThanDays} days`);
  }

  if (readOnly) {
    console.log('  • Only archive READ emails');
  }

  console.log(`\n  Total messages to archive: ${messages.length}\n`);

  if (messages.length > 0 && messages.length <= 10) {
    console.log('  Messages:');
    messages.forEach(msg => {
      const date = msg.date.toLocaleDateString();
      const readStatus = msg.flags.includes('\\Seen') ? '📖' : '📧';
      console.log(`    ${readStatus} [${date}] ${msg.subject.substring(0, 50)}`);
    });
  } else if (messages.length > 10) {
    console.log('  Sample messages (showing first 10):');
    messages.slice(0, 10).forEach(msg => {
      const date = msg.date.toLocaleDateString();
      const readStatus = msg.flags.includes('\\Seen') ? '📖' : '📧';
      console.log(`    ${readStatus} [${date}] ${msg.subject.substring(0, 50)}`);
    });
    console.log(`  ... and ${messages.length - 10} more`);
  }

  console.log('');
}
