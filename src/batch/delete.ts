/**
 * Delete Batch Operation
 * Delete emails with safety checks and trash support
 */

import type { EmailMessage } from '../types';
import type { ImapClient } from '../imap/client';
import {
  executeBatchOperation,
  filterByAge,
  filterBySubject,
  type BatchOperationOptions,
  type BatchOperationResult,
} from './operations';

export interface DeleteOptions extends BatchOperationOptions {
  olderThanDays?: number;
  keywords?: string[];
  permanent?: boolean; // If true, permanently delete. If false, move to Trash
  trashMailbox?: string;
}

/**
 * Delete emails matching criteria
 * By default moves to Trash (safe delete)
 * Use permanent: true for immediate deletion
 */
export async function deleteEmails(
  client: ImapClient,
  messages: EmailMessage[],
  options: DeleteOptions = {}
): Promise<BatchOperationResult> {
  const {
    olderThanDays,
    keywords,
    permanent = false,
    trashMailbox = 'Trash',
    ...batchOptions
  } = options;

  // Filter messages based on criteria
  let filtered = messages;

  if (olderThanDays !== undefined) {
    filtered = filterByAge(filtered, olderThanDays);
  }

  if (keywords && keywords.length > 0) {
    filtered = filterBySubject(filtered, keywords);
  }

  // Delete operation
  const deleteOperation = async (client: ImapClient, message: EmailMessage) => {
    if (permanent) {
      // Permanent delete: add \Deleted flag
      await client.deleteMessage(message.uid);
    } else {
      // Safe delete: move to Trash
      try {
        await client.moveMessage(message.uid, trashMailbox);
      } catch (error) {
        // If Trash doesn't exist, fall back to \Deleted flag
        console.warn(`Could not move to ${trashMailbox}, marking as deleted instead`);
        await client.deleteMessage(message.uid);
      }
    }
  };

  return executeBatchOperation(client, filtered, deleteOperation, batchOptions);
}

/**
 * Display delete preview with warnings
 */
export function displayDeletePreview(
  messages: EmailMessage[],
  options: DeleteOptions
): void {
  const { olderThanDays, keywords, permanent } = options;

  console.log('\n🗑️  Delete Preview\n');

  if (permanent) {
    console.log('  ⚠️  WARNING: PERMANENT DELETE MODE');
    console.log('  ⚠️  Emails will be permanently deleted (cannot be recovered)\n');
  } else {
    console.log('  ℹ️  Safe delete mode: emails will be moved to Trash\n');
  }

  if (olderThanDays !== undefined) {
    console.log(`  • Delete emails older than ${olderThanDays} days`);
  }

  if (keywords && keywords.length > 0) {
    console.log(`  • Delete emails with keywords: ${keywords.join(', ')}`);
  }

  console.log(`\n  Total messages to delete: ${messages.length}\n`);

  if (messages.length > 0 && messages.length <= 10) {
    console.log('  Messages:');
    messages.forEach(msg => {
      const date = msg.date.toLocaleDateString();
      console.log(`    🗑️  [${date}] ${msg.subject.substring(0, 50)}`);
    });
  } else if (messages.length > 10) {
    console.log('  Sample messages (showing first 10):');
    messages.slice(0, 10).forEach(msg => {
      const date = msg.date.toLocaleDateString();
      console.log(`    🗑️  [${date}] ${msg.subject.substring(0, 50)}`);
    });
    console.log(`  ... and ${messages.length - 10} more`);
  }

  console.log('');

  if (permanent && messages.length > 0) {
    console.log('  ⚠️  THIS ACTION CANNOT BE UNDONE');
    console.log('  ⚠️  Please review carefully before confirming\n');
  }
}

/**
 * Validate delete operation safety
 * Returns array of warnings if operation seems risky
 */
export function validateDeleteSafety(
  messages: EmailMessage[],
  options: DeleteOptions
): string[] {
  const warnings: string[] = [];

  // Warn if deleting too many messages at once
  if (messages.length > 100) {
    warnings.push(`Deleting ${messages.length} messages at once (large batch)`);
  }

  // Warn if permanent delete
  if (options.permanent) {
    warnings.push('Permanent delete enabled (cannot be recovered)');
  }

  // Warn if deleting recent emails
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 7);
  const recentEmails = messages.filter(msg => msg.date > recentCutoff);

  if (recentEmails.length > 0) {
    warnings.push(`${recentEmails.length} emails are less than 7 days old`);
  }

  // Warn if deleting unread emails
  const unreadEmails = messages.filter(msg => !msg.flags.includes('\\Seen'));
  if (unreadEmails.length > 0) {
    warnings.push(`${unreadEmails.length} emails are UNREAD`);
  }

  return warnings;
}
