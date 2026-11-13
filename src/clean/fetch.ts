/**
 * Clean Inbox Email Fetching and Classification
 * Converts EmailMessage to CleanInboxEmail with automated detection
 */

import type { EmailMessage, CleanInboxEmail } from '../types';

/**
 * Patterns that indicate automated/system emails
 */
const AUTOMATED_SENDER_PATTERNS = [
  // No-reply variants
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,

  // Notification systems
  /^notifications?@/i,
  /^notify@/i,
  /^alerts?@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce@/i,

  // System/automated senders
  /^jira@/i,
  /^confluence@/i,
  /^calendar[^@]*@/i,
  /^support@.*\.(io|com|net)$/i,

  // Common service senders
  /^info@.*newsletter/i,
  /^news@/i,
  /^updates?@/i,
];

/**
 * Detect if a sender email indicates an automated message
 *
 * @param from - Email from field (may include display name)
 * @returns 'automated' or 'human'
 */
export function detectSenderType(from: string): 'automated' | 'human' {
  // Extract email address from "Name <email>" format
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s<>]+@[^\s<>]+)/);
  const email = emailMatch ? emailMatch[1] : from;

  // Check against automated patterns
  for (const pattern of AUTOMATED_SENDER_PATTERNS) {
    if (pattern.test(email)) {
      return 'automated';
    }
  }

  return 'human';
}

/**
 * Determine if an email is automated (system-generated)
 * Uses sender patterns and subject heuristics
 *
 * @param email - Email message to check
 * @returns true if email appears to be automated
 */
export function isAutomatedEmail(email: EmailMessage): boolean {
  // Check sender patterns first
  if (detectSenderType(email.from) === 'automated') {
    return true;
  }

  // Could add subject-based heuristics here in the future
  // For now, rely primarily on sender detection
  return false;
}

/**
 * Extract display name from email address
 *
 * @param from - Email from field (e.g., "Alice Smith <alice@example.com>")
 * @returns Display name or undefined if not present
 */
function extractFromName(from: string): string | undefined {
  // Match "Name <email>" format
  const match = from.match(/^(.+?)\s*<[^>]+>$/);
  if (match) {
    const name = match[1].trim();
    // Remove quotes if present
    return name.replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/**
 * Options for converting EmailMessage to CleanInboxEmail
 */
export interface ConvertOptions {
  /** Include full body in converted email (default: false for lazy loading) */
  includeBody?: boolean;
}

/**
 * Convert an EmailMessage to CleanInboxEmail
 * Adds classification (isRead, isAutomated) and extracts display name
 *
 * @param email - Source email message
 * @param options - Conversion options
 * @returns CleanInboxEmail ready for session processing
 */
export function convertToCleanInboxEmail(
  email: EmailMessage,
  options: ConvertOptions = {}
): CleanInboxEmail {
  const { includeBody = false } = options;

  const cleanEmail: CleanInboxEmail = {
    uid: email.uid,
    messageId: email.messageId,
    from: email.from,
    to: email.to,
    subject: email.subject,
    date: email.date,
    snippet: email.snippet,
    isRead: email.flags.includes('\\Seen'),
    isAutomated: isAutomatedEmail(email),
  };

  // Extract display name if present
  const fromName = extractFromName(email.from);
  if (fromName) {
    cleanEmail.fromName = fromName;
  }

  // Include body only if explicitly requested
  if (includeBody && email.body) {
    cleanEmail.body = email.body;
  }

  return cleanEmail;
}
