/**
 * Email Digest Generator
 * Generate daily/periodic email summaries with statistics
 */

import type { EmailMessage } from '../types';
import { calculatePriority, type PriorityResult } from '../filtering/priority';

export interface DigestOptions {
  period?: 'today' | 'week' | 'month';
  vipSenders?: string[];
  includeStats?: boolean;
  format?: 'markdown' | 'text' | 'briefing';
  maxUrgent?: number;
  maxNormal?: number;
}

export interface DigestData {
  date: string;
  period: string;
  summary: {
    urgent: number;
    normal: number;
    low: number;
    total: number;
  };
  urgentEmails: Array<{
    message: EmailMessage;
    priority: PriorityResult;
  }>;
  normalEmails: Array<{
    message: EmailMessage;
    priority: PriorityResult;
  }>;
  lowEmails: Array<{
    message: EmailMessage;
    priority: PriorityResult;
  }>;
  stats?: {
    unreadCount: number;
    hasAttachmentsCount: number;
    topSenders: Array<{ email: string; count: number }>;
  };
}

/**
 * Generate digest data from email messages
 */
export function generateDigestData(
  messages: EmailMessage[],
  options: DigestOptions = {}
): DigestData {
  const {
    period = 'today',
    vipSenders = [],
    includeStats = true,
    maxUrgent = 10,
    maxNormal = 5,
  } = options;

  // Analyze each email
  const analyzed = messages.map(msg => ({
    message: msg,
    priority: calculatePriority(msg, vipSenders),
  }));

  // Sort by priority score (descending)
  analyzed.sort((a, b) => b.priority.score - a.priority.score);

  // Group by priority
  const urgent = analyzed.filter(a => a.priority.level === 'urgent');
  const normal = analyzed.filter(a => a.priority.level === 'normal');
  const low = analyzed.filter(a => a.priority.level === 'low');

  // Generate statistics
  const stats = includeStats
    ? {
        unreadCount: messages.filter(m => !m.flags.includes('\\Seen')).length,
        hasAttachmentsCount: messages.filter(m => m.hasAttachments).length,
        topSenders: getTopSenders(messages, 5),
      }
    : undefined;

  return {
    date: new Date().toLocaleDateString(),
    period,
    summary: {
      urgent: urgent.length,
      normal: normal.length,
      low: low.length,
      total: messages.length,
    },
    urgentEmails: urgent.slice(0, maxUrgent),
    normalEmails: normal.slice(0, maxNormal),
    lowEmails: low,
    stats,
  };
}

/**
 * Get top senders by email count
 */
function getTopSenders(
  messages: EmailMessage[],
  limit: number
): Array<{ email: string; count: number }> {
  const senderCounts = new Map<string, number>();

  messages.forEach(msg => {
    const email = extractEmail(msg.from);
    senderCounts.set(email, (senderCounts.get(email) || 0) + 1);
  });

  return Array.from(senderCounts.entries())
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Extract email address from "Name <email>" format
 */
function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

/**
 * Format digest as Markdown
 */
export function formatDigestMarkdown(data: DigestData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Email Digest - ${data.date}`);
  lines.push('');

  // Summary
  lines.push('## 📨 Inbox Summary');
  lines.push(`- **Urgent:** ${data.summary.urgent} emails (🔴 requires immediate attention)`);
  lines.push(`- **Normal:** ${data.summary.normal} emails (🟡 review today)`);
  lines.push(`- **Low Priority:** ${data.summary.low} emails (🟢 newsletters, promotions)`);
  lines.push('');

  // Urgent emails
  if (data.urgentEmails.length > 0) {
    lines.push('## 🚨 Urgent Emails');
    lines.push('');

    data.urgentEmails.forEach((item, index) => {
      const msg = item.message;
      const priority = item.priority;

      lines.push(`### ${index + 1}. ${msg.subject}`);
      lines.push(`**From:** ${msg.from}`);
      lines.push(`**Time:** ${msg.date.toLocaleTimeString()}`);
      lines.push(`**Score:** ${priority.score}/100`);

      if (msg.snippet) {
        lines.push(`**Preview:** "${msg.snippet.substring(0, 100)}..."`);
      }

      if (priority.reasoning.length > 0) {
        lines.push(`**Why urgent:** ${priority.reasoning.join(', ')}`);
      }

      lines.push('');
    });
  }

  // Normal emails (summary only)
  if (data.normalEmails.length > 0) {
    lines.push('## 📧 Normal Priority Emails');
    lines.push('');
    lines.push(`${data.normalEmails.length} emails to review today:`);
    lines.push('');

    data.normalEmails.forEach((item, index) => {
      const msg = item.message;
      lines.push(`${index + 1}. **${msg.subject}** - ${msg.from}`);
    });

    lines.push('');
  }

  // Statistics
  if (data.stats) {
    lines.push('## 📊 Statistics');
    lines.push('');
    lines.push(`- **Total emails:** ${data.summary.total}`);
    lines.push(`- **Unread:** ${data.stats.unreadCount}`);
    lines.push(`- **With attachments:** ${data.stats.hasAttachmentsCount}`);

    if (data.stats.topSenders.length > 0) {
      lines.push('');
      lines.push('**Top senders:**');
      data.stats.topSenders.forEach(sender => {
        lines.push(`  - ${sender.email} (${sender.count} emails)`);
      });
    }

    lines.push('');
  }

  // Low priority summary
  if (data.summary.low > 0) {
    lines.push('## 🟢 Low Priority');
    lines.push('');
    lines.push(`${data.summary.low} newsletters and promotional emails (can wait)`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format digest as plain text
 */
export function formatDigestText(data: DigestData): string {
  const lines: string[] = [];

  // Header
  lines.push(`Email Digest - ${data.date}`);
  lines.push('='.repeat(60));
  lines.push('');

  // Summary
  lines.push('INBOX SUMMARY:');
  lines.push(`  Urgent: ${data.summary.urgent} emails (requires immediate attention)`);
  lines.push(`  Normal: ${data.summary.normal} emails (review today)`);
  lines.push(`  Low Priority: ${data.summary.low} emails (newsletters, promotions)`);
  lines.push('');

  // Urgent emails
  if (data.urgentEmails.length > 0) {
    lines.push('URGENT EMAILS:');
    lines.push('');

    data.urgentEmails.forEach((item, index) => {
      const msg = item.message;
      const priority = item.priority;

      lines.push(`[${index + 1}] ${msg.subject}`);
      lines.push(`    From: ${msg.from}`);
      lines.push(`    Time: ${msg.date.toLocaleTimeString()}`);
      lines.push(`    Score: ${priority.score}/100`);

      if (priority.reasoning.length > 0) {
        lines.push(`    Why: ${priority.reasoning.join(', ')}`);
      }

      lines.push('');
    });
  }

  // Statistics
  if (data.stats) {
    lines.push('STATISTICS:');
    lines.push(`  Total: ${data.summary.total} emails`);
    lines.push(`  Unread: ${data.stats.unreadCount}`);
    lines.push(`  With attachments: ${data.stats.hasAttachmentsCount}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format digest for voice output (brief summary)
 */
export function formatDigestVoice(data: DigestData): string {
  const parts: string[] = [];

  parts.push(`Email digest for ${data.date}.`);

  if (data.summary.urgent > 0) {
    parts.push(`${data.summary.urgent} urgent email${data.summary.urgent > 1 ? 's' : ''} requiring attention.`);
  }

  if (data.summary.normal > 0) {
    parts.push(`${data.summary.normal} normal email${data.summary.normal > 1 ? 's' : ''} to review.`);
  }

  if (data.summary.low > 0) {
    parts.push(`${data.summary.low} low priority email${data.summary.low > 1 ? 's' : ''}.`);
  }

  // Mention urgent senders
  if (data.urgentEmails.length > 0) {
    const urgentSenders = data.urgentEmails
      .slice(0, 3)
      .map(item => extractEmail(item.message.from));

    parts.push(`Urgent emails from: ${urgentSenders.join(', ')}.`);
  }

  return parts.join(' ');
}

/**
 * Format digest for daily briefing integration
 */
export function formatDigestBriefing(data: DigestData): {
  summary: string;
  urgent: Array<{ subject: string; from: string; score: number }>;
  stats: DigestData['stats'];
} {
  return {
    summary: formatDigestVoice(data),
    urgent: data.urgentEmails.map(item => ({
      subject: item.message.subject,
      from: extractEmail(item.message.from),
      score: item.priority.score,
    })),
    stats: data.stats,
  };
}
