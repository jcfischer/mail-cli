/**
 * Clean Inbox Action Creators
 * Factory functions for creating session actions
 */

import type { CleanInboxEmail, SessionAction, ActionMetadata } from '../types';
import type { MessageUID } from '../imap/types';

/**
 * Create a delete action for an email
 *
 * @param email - Email to delete
 * @returns SessionAction for delete
 */
export function createDeleteAction(email: CleanInboxEmail): SessionAction {
  return {
    type: 'delete',
    emailUid: email.uid,
    messageId: email.messageId,
    timestamp: new Date(),
  };
}

/**
 * Create an archive action for an email
 *
 * @param email - Email to archive
 * @param targetMailbox - Target mailbox (default: 'Archive')
 * @returns SessionAction for archive
 */
export function createArchiveAction(
  email: CleanInboxEmail,
  targetMailbox: string = 'Archive'
): SessionAction {
  return {
    type: 'archive',
    emailUid: email.uid,
    messageId: email.messageId,
    timestamp: new Date(),
    metadata: {
      targetMailbox,
    },
  };
}

/**
 * Create a skip action for an email
 *
 * @param email - Email to skip
 * @returns SessionAction for skip
 */
export function createSkipAction(email: CleanInboxEmail): SessionAction {
  return {
    type: 'skip',
    emailUid: email.uid,
    messageId: email.messageId,
    timestamp: new Date(),
  };
}

/**
 * Options for creating a reply action
 */
export interface ReplyActionOptions {
  /** UID of the created draft, when the server reported one */
  draftUid?: MessageUID;
  /** Message-ID of the created draft */
  draftMessageId?: string;
  /** User's reply intent (what they want to say) */
  replyIntent?: string;
  /** Target mailbox to archive email after reply (optional) */
  targetMailbox?: string;
}

/**
 * Create a reply action for an email
 *
 * @param email - Email being replied to
 * @param options - Reply action options
 * @returns SessionAction for reply
 */
export function createReplyAction(
  email: CleanInboxEmail,
  options: ReplyActionOptions
): SessionAction {
  const metadata: ActionMetadata = {
    draftUid: options.draftUid,
  };

  if (options.draftMessageId) {
    metadata.draftMessageId = options.draftMessageId;
  }
  if (options.replyIntent) {
    metadata.replyIntent = options.replyIntent;
  }
  if (options.targetMailbox) {
    metadata.targetMailbox = options.targetMailbox;
  }

  return {
    type: 'reply',
    emailUid: email.uid,
    messageId: email.messageId,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Options for creating a todo action
 */
export interface TodoActionOptions {
  /** Tana node ID of the created todo */
  tanaNodeId: string;
  /** Description of the todo */
  todoDescription?: string;
  /** Target mailbox to archive email after todo (optional) */
  targetMailbox?: string;
}

/**
 * Create a todo action for an email
 *
 * @param email - Email to create todo from
 * @param options - Todo action options
 * @returns SessionAction for todo
 */
export function createTodoAction(
  email: CleanInboxEmail,
  options: TodoActionOptions
): SessionAction {
  const metadata: ActionMetadata = {
    tanaNodeId: options.tanaNodeId,
  };

  if (options.todoDescription) {
    metadata.todoDescription = options.todoDescription;
  }
  if (options.targetMailbox) {
    metadata.targetMailbox = options.targetMailbox;
  }

  return {
    type: 'todo',
    emailUid: email.uid,
    messageId: email.messageId,
    timestamp: new Date(),
    metadata,
  };
}
