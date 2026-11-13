/**
 * Clean Inbox Action Executor
 * Executes session actions against IMAP server
 */

import type { ImapClient } from '../imap/client';
import type { SessionAction } from '../types';

/**
 * Execute a delete action - marks message as deleted
 *
 * @param client - IMAP client
 * @param action - Delete action to execute
 * @param mailbox - Source mailbox (default: INBOX)
 */
export async function executeDeleteAction(
  client: ImapClient,
  action: SessionAction,
  mailbox: string = 'INBOX'
): Promise<void> {
  await client.deleteMessage(action.emailUid, mailbox);
}

/**
 * Execute an archive action - marks as read and moves to archive folder
 *
 * @param client - IMAP client
 * @param action - Archive action to execute
 * @param sourceMailbox - Source mailbox (default: INBOX)
 */
export async function executeArchiveAction(
  client: ImapClient,
  action: SessionAction,
  sourceMailbox: string = 'INBOX'
): Promise<void> {
  const targetMailbox = action.metadata?.targetMailbox || 'Archive';

  // Mark as read first
  await client.markAsRead(action.emailUid, sourceMailbox);

  // Then move to archive
  await client.moveMessage(action.emailUid, targetMailbox, sourceMailbox);
}

/**
 * Execute a skip action - does nothing, email remains in place
 *
 * @param _client - IMAP client (unused)
 * @param _action - Skip action (unused)
 */
export async function executeSkipAction(
  _client: ImapClient,
  _action: SessionAction
): Promise<void> {
  // Skip does nothing - email stays in inbox
  return;
}

/**
 * Execute a reply action - archives the original after reply is sent
 * Note: Draft creation is handled separately by the reply-email skill
 *
 * @param client - IMAP client
 * @param action - Reply action to execute
 * @param sourceMailbox - Source mailbox (default: INBOX)
 */
export async function executeReplyAction(
  client: ImapClient,
  action: SessionAction,
  sourceMailbox: string = 'INBOX'
): Promise<void> {
  // After reply draft is created, archive the original
  const targetMailbox = action.metadata?.targetMailbox || 'Archive';

  // Mark as read
  await client.markAsRead(action.emailUid, sourceMailbox);

  // Move to archive
  await client.moveMessage(action.emailUid, targetMailbox, sourceMailbox);
}

/**
 * Execute a todo action - archives the original after todo is created
 * Note: Tana todo creation is handled separately via supertag CLI
 *
 * @param client - IMAP client
 * @param action - Todo action to execute
 * @param sourceMailbox - Source mailbox (default: INBOX)
 */
export async function executeTodoAction(
  client: ImapClient,
  action: SessionAction,
  sourceMailbox: string = 'INBOX'
): Promise<void> {
  // After todo is created in Tana, archive the original email
  const targetMailbox = action.metadata?.targetMailbox || 'Archive';

  // Mark as read
  await client.markAsRead(action.emailUid, sourceMailbox);

  // Move to archive
  await client.moveMessage(action.emailUid, targetMailbox, sourceMailbox);
}

/**
 * Execute any session action
 *
 * @param client - IMAP client
 * @param action - Action to execute
 * @param sourceMailbox - Source mailbox (default: INBOX)
 */
export async function executeAction(
  client: ImapClient,
  action: SessionAction,
  sourceMailbox: string = 'INBOX'
): Promise<void> {
  switch (action.type) {
    case 'delete':
      await executeDeleteAction(client, action, sourceMailbox);
      break;
    case 'archive':
      await executeArchiveAction(client, action, sourceMailbox);
      break;
    case 'skip':
      await executeSkipAction(client, action);
      break;
    case 'reply':
      await executeReplyAction(client, action, sourceMailbox);
      break;
    case 'todo':
      await executeTodoAction(client, action, sourceMailbox);
      break;
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}
