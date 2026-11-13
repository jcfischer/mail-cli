/**
 * Priority Detection Algorithm
 * Calculates email priority score based on various factors
 */

import type { EmailMessage } from '../types';

export type PriorityLevel = 'urgent' | 'normal' | 'low';

export interface PriorityFactors {
  fromVIP: boolean;
  urgentKeywords: number;
  ccCount: number;
  hasAttachments: boolean;
  recentThread: boolean;
  isNewsletter: boolean;
  isPromo: boolean;
}

export interface PriorityResult {
  level: PriorityLevel;
  score: number;
  factors: PriorityFactors;
  reasoning: string[];
}

/**
 * Default urgent keywords
 */
const DEFAULT_URGENT_KEYWORDS = [
  'URGENT',
  'ASAP',
  'IMPORTANT',
  'CRITICAL',
  'IMMEDIATE',
  'ACTION REQUIRED',
  'TIME SENSITIVE',
  'DEADLINE',
  'EOD',
  'PRIORITY',
];

/**
 * Newsletter indicators
 */
const NEWSLETTER_INDICATORS = [
  'newsletter',
  'digest',
  'weekly',
  'monthly',
  'subscription',
  'unsubscribe',
  'mailing list',
];

/**
 * Promotional indicators
 */
const PROMO_INDICATORS = [
  'sale',
  'discount',
  'offer',
  'deal',
  'promotion',
  'limited time',
  'free shipping',
  'shop now',
  'buy now',
];

/**
 * Check if email contains urgent keywords
 */
function countUrgentKeywords(subject: string, body?: string): number {
  const text = `${subject} ${body || ''}`.toUpperCase();
  return DEFAULT_URGENT_KEYWORDS.filter(keyword => text.includes(keyword)).length;
}

/**
 * Check if email is likely a newsletter
 */
function isNewsletter(subject: string, body?: string): boolean {
  const text = `${subject} ${body || ''}`.toLowerCase();
  return NEWSLETTER_INDICATORS.some(indicator => text.includes(indicator));
}

/**
 * Check if email is likely promotional
 */
function isPromo(subject: string, body?: string): boolean {
  const text = `${subject} ${body || ''}`.toLowerCase();
  return PROMO_INDICATORS.some(indicator => text.includes(indicator));
}

/**
 * Calculate priority score for an email
 *
 * Score range: 0-100
 * - 80-100: Urgent (requires immediate attention)
 * - 50-79:  Normal (review today)
 * - 0-49:   Low (newsletters, promos, can wait)
 */
export function calculatePriority(
  message: EmailMessage,
  vipSenders: string[] = []
): PriorityResult {
  let score = 50; // Base score (normal priority)
  const reasoning: string[] = [];

  // Factor 1: VIP sender (+30 points)
  const fromVIP = vipSenders.some(vip =>
    message.from.toLowerCase().includes(vip.toLowerCase())
  );
  if (fromVIP) {
    score += 30;
    reasoning.push('From VIP sender');
  }

  // Factor 2: Urgent keywords (+10 points each)
  const urgentKeywords = countUrgentKeywords(message.subject, message.body);
  if (urgentKeywords > 0) {
    score += urgentKeywords * 10;
    reasoning.push(`${urgentKeywords} urgent keyword(s) detected`);
  }

  // Factor 3: Attachments (+5 points)
  const hasAttachments = message.hasAttachments;
  if (hasAttachments) {
    score += 5;
    reasoning.push('Has attachments');
  }

  // Factor 4: CC count (mass emails are lower priority, -10 points if many CCs)
  const ccCount = message.to.length - 1; // Subtract self
  if (ccCount > 5) {
    score -= 10;
    reasoning.push('Mass email (many recipients)');
  }

  // Factor 5: Recent thread (+10 points)
  // For now, assume not a recent thread (would need thread tracking)
  const recentThread = false;

  // Factor 6: Newsletter detection (-20 points)
  const isNewsletterEmail = isNewsletter(message.subject, message.snippet);
  if (isNewsletterEmail) {
    score -= 20;
    reasoning.push('Newsletter detected');
  }

  // Factor 7: Promotional detection (-15 points)
  const isPromoEmail = isPromo(message.subject, message.snippet);
  if (isPromoEmail) {
    score -= 15;
    reasoning.push('Promotional content detected');
  }

  // Normalize score to 0-100 range
  score = Math.max(0, Math.min(100, score));

  // Determine priority level
  let level: PriorityLevel;
  if (score >= 80) {
    level = 'urgent';
  } else if (score >= 50) {
    level = 'normal';
  } else {
    level = 'low';
  }

  return {
    level,
    score,
    factors: {
      fromVIP,
      urgentKeywords,
      ccCount,
      hasAttachments,
      recentThread,
      isNewsletter: isNewsletterEmail,
      isPromo: isPromoEmail,
    },
    reasoning,
  };
}

/**
 * Get priority emoji for display
 */
export function getPriorityEmoji(level: PriorityLevel): string {
  switch (level) {
    case 'urgent':
      return '🔴';
    case 'normal':
      return '🟡';
    case 'low':
      return '🟢';
  }
}

/**
 * Get priority label for display
 */
export function getPriorityLabel(level: PriorityLevel): string {
  switch (level) {
    case 'urgent':
      return 'URGENT';
    case 'normal':
      return 'Normal';
    case 'low':
      return 'Low';
  }
}
