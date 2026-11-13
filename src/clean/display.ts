/**
 * Clean Inbox Display Formatter
 * Format emails and session info for terminal display
 */

import type { CleanInboxEmail, SessionStats } from '../types';

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Check if this year
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isThisYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Extract display name from email address
 */
function extractDisplayName(email: CleanInboxEmail): string {
  // Use fromName if available
  if (email.fromName) {
    return email.fromName;
  }

  // Extract from "Name <email>" format
  const match = email.from.match(/^(.+?)\s*<[^>]+>$/);
  if (match) {
    return match[1].trim().replace(/^["']|["']$/g, '');
  }

  // Return the email address
  return email.from.replace(/^<|>$/g, '');
}

/**
 * Format email header for display
 * Shows sender, subject, date, and status badges
 */
export function formatEmailHeader(email: CleanInboxEmail): string {
  const badges: string[] = [];

  if (!email.isRead) {
    badges.push('[Unread]');
  }
  if (email.isAutomated) {
    badges.push('[Auto]');
  }

  const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';
  const sender = extractDisplayName(email);
  const date = formatDate(email.date);

  const lines = [
    `─────────────────────────────────────────────────────────────`,
    `From: ${sender}${badgeStr}`,
    `Subject: ${email.subject}`,
    `Date: ${date}`,
    `─────────────────────────────────────────────────────────────`,
  ];

  return lines.join('\n');
}

/**
 * Options for snippet formatting
 */
interface SnippetOptions {
  /** Maximum length before truncation */
  maxLength?: number;
}

/**
 * Format email snippet/preview
 */
export function formatEmailSnippet(
  email: CleanInboxEmail,
  options: SnippetOptions = {}
): string {
  const { maxLength = 200 } = options;

  if (!email.snippet || email.snippet.trim() === '') {
    return '(no preview)';
  }

  const snippet = email.snippet.trim();

  if (snippet.length <= maxLength) {
    return snippet;
  }

  return snippet.substring(0, maxLength) + '...';
}

/**
 * Format progress bar showing position in email list
 */
export function formatProgressBar(current: number, total: number): string {
  if (total === 0) {
    return `[0/0] 0%`;
  }

  const percentage = Math.round((current / total) * 100);
  return `[${current}/${total}] ${percentage}%`;
}

/**
 * Format the action prompt with available commands
 */
export function formatActionPrompt(): string {
  const actions = [
    '[d] Delete',
    '[a] Archive',
    '[r] Reply',
    '[t] Todo',
    '[s] Skip',
    '[q] Quit',
  ];

  return `Actions: ${actions.join('  ')}`;
}

/**
 * Format session statistics
 */
export function formatSessionStats(stats: SessionStats): string {
  const lines = [
    `Session Stats (${stats.total} total):`,
    `  Deleted:  ${stats.deleted}`,
    `  Archived: ${stats.archived}`,
    `  Replied:  ${stats.replied}`,
    `  Todos:    ${stats.todos}`,
    `  Skipped:  ${stats.skipped}`,
  ];

  return lines.join('\n');
}

/**
 * Format a complete email view for the TUI
 */
export function formatEmailView(
  email: CleanInboxEmail,
  current: number,
  total: number
): string {
  const lines = [
    '',
    formatProgressBar(current, total),
    '',
    formatEmailHeader(email),
    '',
    formatEmailSnippet(email),
    '',
    formatActionPrompt(),
    '',
  ];

  return lines.join('\n');
}
