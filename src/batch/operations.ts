/**
 * Batch Operations Engine
 * Safe batch operations with dry-run mode and confirmations
 */

import type { EmailMessage } from '../types';
import type { ImapClient } from '../imap/client';

export interface BatchOperationOptions {
  dryRun?: boolean;
  confirm?: boolean;
  maxBatch?: number;
}

export interface BatchOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{ uid: number; error: string }>;
  dryRun: boolean;
}

export type BatchOperation = 'archive' | 'delete' | 'label' | 'mark-read' | 'mark-unread';

/**
 * Base batch operation executor
 * Handles dry-run mode, batch limits, and error collection
 */
export async function executeBatchOperation(
  client: ImapClient,
  messages: EmailMessage[],
  operation: (client: ImapClient, message: EmailMessage) => Promise<void>,
  options: BatchOperationOptions = {}
): Promise<BatchOperationResult> {
  const {
    dryRun = false,
    maxBatch = 1000,
  } = options;

  const result: BatchOperationResult = {
    success: true,
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    dryRun,
  };

  // Limit batch size for safety
  const messagesToProcess = messages.slice(0, maxBatch);

  if (messages.length > maxBatch) {
    result.skipped = messages.length - maxBatch;
    console.warn(`⚠️  Batch size limited to ${maxBatch} messages. ${result.skipped} messages skipped.`);
  }

  // Dry-run mode: just count what would be processed
  if (dryRun) {
    result.processed = messagesToProcess.length;
    return result;
  }

  // Execute operation on each message
  for (const message of messagesToProcess) {
    try {
      await operation(client, message);
      result.processed++;
    } catch (error) {
      result.failed++;
      result.errors.push({
        uid: message.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      result.success = false;
    }
  }

  return result;
}

/**
 * Filter messages by age (older than N days)
 */
export function filterByAge(messages: EmailMessage[], days: number): EmailMessage[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return messages.filter(message => message.date < cutoffDate);
}

/**
 * Filter messages by read status
 */
export function filterByReadStatus(messages: EmailMessage[], read: boolean): EmailMessage[] {
  return messages.filter(message => {
    const isRead = message.flags.includes('\\Seen');
    return read ? isRead : !isRead;
  });
}

/**
 * Filter messages by sender
 */
export function filterBySender(messages: EmailMessage[], senders: string[]): EmailMessage[] {
  return messages.filter(message =>
    senders.some(sender =>
      message.from.toLowerCase().includes(sender.toLowerCase())
    )
  );
}

/**
 * Filter messages by subject keywords
 */
export function filterBySubject(messages: EmailMessage[], keywords: string[]): EmailMessage[] {
  return messages.filter(message =>
    keywords.some(keyword =>
      message.subject.toLowerCase().includes(keyword.toLowerCase())
    )
  );
}

/**
 * Display batch operation summary
 */
export function displayBatchSummary(
  operation: BatchOperation,
  messages: EmailMessage[],
  result: BatchOperationResult
): void {
  console.log('\n' + '='.repeat(60));
  console.log(`Batch Operation: ${operation.toUpperCase()}`);
  console.log('='.repeat(60));

  if (result.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  console.log(`Total messages: ${messages.length}`);
  console.log(`Processed: ${result.processed}`);

  if (result.failed > 0) {
    console.log(`Failed: ${result.failed}`);
  }

  if (result.skipped > 0) {
    console.log(`Skipped: ${result.skipped} (batch limit exceeded)`);
  }

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(({ uid, error }) => {
      console.log(`  UID ${uid}: ${error}`);
    });
  }

  if (result.success) {
    if (result.dryRun) {
      console.log('\n✅ Dry run completed successfully');
      console.log('   Run with --apply to execute the operation');
    } else {
      console.log('\n✅ Operation completed successfully');
    }
  } else {
    console.log('\n⚠️  Operation completed with errors');
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Prompt user for confirmation
 * Returns true if user confirms, false otherwise
 */
export async function promptConfirmation(message: string): Promise<boolean> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
