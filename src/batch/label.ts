/**
 * Label/Move Batch Operation
 * Bulk label or folder operations
 */

import type { EmailMessage } from '../types';
import type { ImapClient } from '../imap/client';
import type { PriorityLevel } from '../filtering/priority';
import { calculatePriority } from '../filtering/priority';
import {
  executeBatchOperation,
  filterBySubject,
  type BatchOperationOptions,
  type BatchOperationResult,
} from './operations';

export interface LabelOptions extends BatchOperationOptions {
  targetMailbox: string;
  keywords?: string[];
  priority?: PriorityLevel;
  vipSenders?: string[];
  hasUnsubscribe?: boolean;
}

/**
 * Move emails to a target mailbox/folder based on criteria
 */
export async function labelEmails(
  client: ImapClient,
  messages: EmailMessage[],
  options: LabelOptions
): Promise<BatchOperationResult> {
  const {
    targetMailbox,
    keywords,
    priority,
    vipSenders = [],
    hasUnsubscribe,
    ...batchOptions
  } = options;

  // Filter messages based on criteria
  let filtered = messages;

  // Filter by keywords in subject
  if (keywords && keywords.length > 0) {
    filtered = filterBySubject(filtered, keywords);
  }

  // Filter by priority level
  if (priority) {
    filtered = filtered.filter(message => {
      const result = calculatePriority(message, vipSenders);
      return result.level === priority;
    });
  }

  // Filter by unsubscribe link (newsletter detection)
  if (hasUnsubscribe !== undefined) {
    filtered = filtered.filter(message => {
      const text = `${message.subject} ${message.snippet || ''}`.toLowerCase();
      const hasUnsubscribeLink = text.includes('unsubscribe');
      return hasUnsubscribe ? hasUnsubscribeLink : !hasUnsubscribeLink;
    });
  }

  // Label operation: move to target mailbox
  const labelOperation = async (client: ImapClient, message: EmailMessage) => {
    await client.moveMessage(message.uid, targetMailbox);
  };

  return executeBatchOperation(client, filtered, labelOperation, batchOptions);
}

/**
 * Mark emails as read in bulk
 */
export async function markAsReadBulk(
  client: ImapClient,
  messages: EmailMessage[],
  options: BatchOperationOptions = {}
): Promise<BatchOperationResult> {
  const markReadOperation = async (client: ImapClient, message: EmailMessage) => {
    await client.markAsRead(message.uid);
  };

  return executeBatchOperation(client, messages, markReadOperation, options);
}

/**
 * Mark emails as unread in bulk
 */
export async function markAsUnreadBulk(
  client: ImapClient,
  messages: EmailMessage[],
  options: BatchOperationOptions = {}
): Promise<BatchOperationResult> {
  const markUnreadOperation = async (client: ImapClient, message: EmailMessage) => {
    await client.markAsUnread(message.uid);
  };

  return executeBatchOperation(client, messages, markUnreadOperation, options);
}

/**
 * Display label/move preview
 */
export function displayLabelPreview(
  messages: EmailMessage[],
  options: LabelOptions
): void {
  const { targetMailbox, keywords, priority, hasUnsubscribe } = options;

  console.log('\n🏷️  Label/Move Preview\n');
  console.log(`  Target mailbox: ${targetMailbox}\n`);

  if (keywords && keywords.length > 0) {
    console.log(`  • Filter by keywords: ${keywords.join(', ')}`);
  }

  if (priority) {
    console.log(`  • Filter by priority: ${priority}`);
  }

  if (hasUnsubscribe !== undefined) {
    console.log(`  • Filter by unsubscribe link: ${hasUnsubscribe ? 'yes' : 'no'}`);
  }

  console.log(`\n  Total messages to move: ${messages.length}\n`);

  if (messages.length > 0 && messages.length <= 10) {
    console.log('  Messages:');
    messages.forEach(msg => {
      const date = msg.date.toLocaleDateString();
      console.log(`    📧 [${date}] ${msg.subject.substring(0, 50)}`);
    });
  } else if (messages.length > 10) {
    console.log('  Sample messages (showing first 10):');
    messages.slice(0, 10).forEach(msg => {
      const date = msg.date.toLocaleDateString();
      console.log(`    📧 [${date}] ${msg.subject.substring(0, 50)}`);
    });
    console.log(`  ... and ${messages.length - 10} more`);
  }

  console.log('');
}
