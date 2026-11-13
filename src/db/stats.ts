/**
 * Email Statistics Engine
 * Generates analytics and insights from indexed emails (per-account databases)
 */

import { getDatabase } from './client';
import { emails } from './schema';
import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

export interface EmailStatsOptions {
  account: string;
  period: 'day' | 'week' | 'month';
  startDate?: Date;
  endDate?: Date;
  excludeUserEmail?: string;
}

export interface EmailStatsSummary {
  period: string;
  totalEmails: number;
  unreadEmails: number;
  readEmails: number;
  starredEmails: number;
  archivedEmails: number;
  urgentEmails: number;
  normalEmails: number;
  lowPriorityEmails: number;
  withAttachments: number;
  topSenders: Array<{ email: string; name: string | null; count: number }>;
  emailsByDay: Array<{ date: string; count: number }>;
  readRate: number; // Percentage
}

export class EmailStatsEngine {
  /**
   * Get email statistics for a given period
   */
  async getStats(options: EmailStatsOptions): Promise<EmailStatsSummary> {
    const { account, period } = options;
    const db = getDatabase(account);

    // Calculate date range
    const { startDate, endDate } = this.calculateDateRange(period, options.startDate, options.endDate);
    const startTimestamp = startDate.getTime();
    const endTimestamp = endDate.getTime();

    // Get all emails in the period (no account filter needed - DB is account-specific)
    const periodEmails = await db.query.emails.findMany({
      where: and(
        gte(emails.date, startTimestamp),
        lte(emails.date, endTimestamp)
      ),
    });

    // Calculate statistics
    const totalEmails = periodEmails.length;
    const unreadEmails = periodEmails.filter(e => !e.isRead).length;
    const readEmails = periodEmails.filter(e => e.isRead).length;
    const starredEmails = periodEmails.filter(e => e.isStarred).length;
    const archivedEmails = periodEmails.filter(e => e.isArchived).length;
    const urgentEmails = periodEmails.filter(e => e.priority >= 80).length;
    const normalEmails = periodEmails.filter(e => e.priority >= 50 && e.priority < 80).length;
    const lowPriorityEmails = periodEmails.filter(e => e.priority < 50).length;
    const withAttachments = periodEmails.filter(e => e.hasAttachments).length;
    const readRate = totalEmails > 0 ? Math.round((readEmails / totalEmails) * 100) : 0;

    // Get top senders
    const senderCounts = new Map<string, { name: string | null; count: number }>();
    for (const email of periodEmails) {
      // Skip emails from the user's own email address
      if (options.excludeUserEmail && email.from === options.excludeUserEmail) {
        continue;
      }
      const existing = senderCounts.get(email.from);
      if (existing) {
        existing.count++;
      } else {
        senderCounts.set(email.from, { name: email.fromName, count: 1 });
      }
    }

    const topSenders = Array.from(senderCounts.entries())
      .map(([email, data]) => ({ email, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get emails by day
    const emailsByDay = this.groupEmailsByDay(periodEmails, startDate, endDate);

    return {
      period: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`,
      totalEmails,
      unreadEmails,
      readEmails,
      starredEmails,
      archivedEmails,
      urgentEmails,
      normalEmails,
      lowPriorityEmails,
      withAttachments,
      topSenders,
      emailsByDay,
      readRate,
    };
  }

  /**
   * Get email volume trends
   */
  async getVolumeTrend(account: string, days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const db = getDatabase(account);
    const endDate = new Date();
    const startDate = subDays(endDate, days);

    // No account filter needed - DB is account-specific
    const periodEmails = await db.query.emails.findMany({
      where: gte(emails.date, startDate.getTime()),
    });

    return this.groupEmailsByDay(periodEmails, startDate, endDate);
  }

  /**
   * Get priority distribution
   */
  async getPriorityDistribution(account: string, period: 'day' | 'week' | 'month' = 'week'): Promise<{
    urgent: number;
    normal: number;
    low: number;
  }> {
    const db = getDatabase(account);
    const { startDate, endDate } = this.calculateDateRange(period);

    // No account filter needed - DB is account-specific
    const periodEmails = await db.query.emails.findMany({
      where: and(
        gte(emails.date, startDate.getTime()),
        lte(emails.date, endDate.getTime())
      ),
    });

    return {
      urgent: periodEmails.filter(e => e.priority >= 80).length,
      normal: periodEmails.filter(e => e.priority >= 50 && e.priority < 80).length,
      low: periodEmails.filter(e => e.priority < 50).length,
    };
  }

  /**
   * Get sender statistics
   */
  async getSenderStats(
    account: string,
    limit: number = 20,
    period?: 'day' | 'week' | 'month',
    excludeUserEmail?: string
  ): Promise<Array<{
    email: string;
    name: string | null;
    totalEmails: number;
    unreadEmails: number;
    avgPriority: number;
  }>> {
    const db = getDatabase(account);

    // Build query with optional date filtering (no account filter - DB is account-specific)
    let query;
    if (period) {
      const { startDate, endDate } = this.calculateDateRange(period);
      query = db.query.emails.findMany({
        where: and(
          gte(emails.date, startDate.getTime()),
          lte(emails.date, endDate.getTime())
        ),
      });
    } else {
      query = db.query.emails.findMany();
    }

    const allEmails = await query;

    const senderMap = new Map<string, {
      name: string | null;
      totalEmails: number;
      unreadEmails: number;
      priorities: number[];
    }>();

    for (const email of allEmails) {
      // Skip emails from the user's own email address
      if (excludeUserEmail && email.from === excludeUserEmail) {
        continue;
      }
      const existing = senderMap.get(email.from);
      if (existing) {
        existing.totalEmails++;
        if (!email.isRead) existing.unreadEmails++;
        existing.priorities.push(email.priority);
      } else {
        senderMap.set(email.from, {
          name: email.fromName,
          totalEmails: 1,
          unreadEmails: email.isRead ? 0 : 1,
          priorities: [email.priority],
        });
      }
    }

    return Array.from(senderMap.entries())
      .map(([email, data]) => ({
        email,
        name: data.name,
        totalEmails: data.totalEmails,
        unreadEmails: data.unreadEmails,
        avgPriority: Math.round(data.priorities.reduce((a, b) => a + b, 0) / data.priorities.length),
      }))
      .sort((a, b) => b.totalEmails - a.totalEmails)
      .slice(0, limit);
  }

  /**
   * Calculate date range based on period
   */
  private calculateDateRange(
    period: 'day' | 'week' | 'month',
    customStart?: Date,
    customEnd?: Date
  ): { startDate: Date; endDate: Date } {
    if (customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }

    const endDate = endOfDay(new Date());
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = startOfDay(new Date());
        break;
      case 'week':
        startDate = startOfDay(subDays(new Date(), 7));
        break;
      case 'month':
        startDate = startOfDay(subDays(new Date(), 30));
        break;
    }

    return { startDate, endDate };
  }

  /**
   * Group emails by day
   */
  private groupEmailsByDay(
    emails: Array<{ date: number }>,
    startDate: Date,
    endDate: Date
  ): Array<{ date: string; count: number }> {
    const dayMap = new Map<string, number>();

    // Initialize all days with 0
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      dayMap.set(dateKey, 0);
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Count emails per day
    for (const email of emails) {
      const dateKey = format(new Date(email.date), 'yyyy-MM-dd');
      dayMap.set(dateKey, (dayMap.get(dateKey) || 0) + 1);
    }

    return Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
