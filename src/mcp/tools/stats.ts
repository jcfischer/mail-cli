/**
 * Email Stats Tool
 *
 * - email_stats: Email analytics and statistics
 */

import { EmailStatsEngine, type EmailStatsSummary } from '../../db/stats';
import { loadConfig, getAccount } from '../../config';
import type { StatsInput } from '../schemas';

export interface StatsToolResult {
  account: string;
  period: string;
  totalEmails: number;
  unreadEmails: number;
  readEmails: number;
  starredEmails: number;
  urgentEmails: number;
  normalEmails: number;
  lowPriorityEmails: number;
  withAttachments: number;
  readRate: number;
  topSenders: Array<{ email: string; name: string | null; count: number }>;
  emailsByDay: Array<{ date: string; count: number }>;
}

/**
 * Get email statistics for the specified period
 */
export async function stats(input: StatsInput): Promise<StatsToolResult> {
  const config = loadConfig();
  const account = getAccount(config, input.account);

  if (!account) {
    throw new Error(`Account not found: ${input.account}`);
  }

  const statsEngine = new EmailStatsEngine();
  const result = await statsEngine.getStats({
    account: input.account,
    period: input.period,
    excludeUserEmail: account.from.email,
  });

  return {
    account: input.account,
    period: result.period,
    totalEmails: result.totalEmails,
    unreadEmails: result.unreadEmails,
    readEmails: result.readEmails,
    starredEmails: result.starredEmails,
    urgentEmails: result.urgentEmails,
    normalEmails: result.normalEmails,
    lowPriorityEmails: result.lowPriorityEmails,
    withAttachments: result.withAttachments,
    readRate: result.readRate,
    topSenders: result.topSenders,
    emailsByDay: result.emailsByDay,
  };
}
