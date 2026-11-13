/**
 * Clean Inbox Session Management
 * Manages session lifecycle, navigation, and action recording
 */

import type {
  CleanInboxSession,
  CleanInboxEmail,
  CleanInboxOptions,
  SessionAction,
  SessionStats,
} from '../types';

/**
 * Initialize zeroed session stats with total count
 */
export function initializeStats(total: number): SessionStats {
  return {
    deleted: 0,
    archived: 0,
    replied: 0,
    todos: 0,
    skipped: 0,
    total,
  };
}

/**
 * Create a new clean inbox session
 */
export function createSession(
  options: CleanInboxOptions,
  emails: CleanInboxEmail[]
): CleanInboxSession {
  return {
    account: options.account,
    startTime: new Date(),
    emails,
    currentIndex: 0,
    actions: [],
    stats: initializeStats(emails.length),
    options,
  };
}

/**
 * Get the current email in the session
 * Returns null if past end of list or empty session
 */
export function currentEmail(session: CleanInboxSession): CleanInboxEmail | null {
  if (session.currentIndex >= session.emails.length) {
    return null;
  }
  return session.emails[session.currentIndex];
}

/**
 * Advance to the next email in the session
 * Returns the next email, or null if no more emails
 */
export function nextEmail(session: CleanInboxSession): CleanInboxEmail | null {
  session.currentIndex++;
  return currentEmail(session);
}

/**
 * Record an action taken on an email
 * Updates session actions list and increments appropriate stat counter
 */
export function recordAction(session: CleanInboxSession, action: SessionAction): void {
  session.actions.push(action);

  // Increment the appropriate stat counter
  switch (action.type) {
    case 'delete':
      session.stats.deleted++;
      break;
    case 'archive':
      session.stats.archived++;
      break;
    case 'reply':
      session.stats.replied++;
      break;
    case 'todo':
      session.stats.todos++;
      break;
    case 'skip':
      session.stats.skipped++;
      break;
  }
}

/**
 * Generate a human-readable session summary
 */
export function getSessionSummary(session: CleanInboxSession): string {
  const { stats, account } = session;
  const lines = [
    `Clean Inbox Session Summary (${account})`,
    `─────────────────────────────────────`,
    `Total processed: ${stats.total}`,
    `  Deleted:  ${stats.deleted}`,
    `  Archived: ${stats.archived}`,
    `  Replied:  ${stats.replied}`,
    `  Todos:    ${stats.todos}`,
    `  Skipped:  ${stats.skipped}`,
  ];
  return lines.join('\n');
}
