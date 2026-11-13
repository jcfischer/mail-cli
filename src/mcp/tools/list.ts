/**
 * Email List Tools
 *
 * - email_list: List emails from a mailbox
 * - email_get: Get full email by Message-ID
 */

import { searchEmails, findEmailByMessageId, findEmailByMessageIdAllAccounts } from '../../db/search';
import { loadConfig, getAccount, listAccounts } from '../../config';
import { createImapConfig, ImapClient } from '../../imap/client';
import type { ListInput, GetInput } from '../schemas';

export interface ListResultItem {
  messageId: string;
  uid: number;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  priority: number;
  hasAttachments: boolean;
}

export interface ListToolResult {
  account: string;
  mailbox: string;
  results: ListResultItem[];
  total: number;
}

/**
 * List emails from a mailbox
 */
export async function list(input: ListInput): Promise<ListToolResult> {
  // Use searchEmails with empty query to list all emails matching filters
  const results = await searchEmails('', {
    account: input.account,
    mailbox: input.mailbox,
    limit: input.limit,
    unread: input.unseen,
  });

  // Filter by 'since' days if specified
  let filteredResults = results;
  if (input.since) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - input.since);
    const sinceTimestamp = sinceDate.getTime();
    filteredResults = results.filter((r) => r.date >= sinceTimestamp);
  }

  return {
    account: input.account,
    mailbox: input.mailbox || 'INBOX',
    results: filteredResults.map((r) => ({
      messageId: r.messageId,
      uid: r.uid,
      subject: r.subject,
      from: r.from,
      date: new Date(r.date).toISOString(),
      snippet: r.snippet || '',
      isRead: Boolean(r.isRead),
      isStarred: Boolean(r.isStarred),
      priority: r.priority,
      hasAttachments: Boolean(r.hasAttachments),
    })),
    total: filteredResults.length,
  };
}

export interface GetToolResult {
  messageId: string;
  uid: number;
  account: string;
  mailbox: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  body: string;
  htmlBody?: string;
  hasAttachments: boolean;
  flags: string[];
}

/**
 * Get full email by Message-ID (fetches body from IMAP)
 */
export async function get(input: GetInput): Promise<GetToolResult | null> {
  const config = loadConfig();
  const accounts = listAccounts(config);

  // Find email in local database
  let emailRecord;
  let foundAccount: string;

  if (input.account) {
    emailRecord = await findEmailByMessageId(input.messageId, input.account);
    foundAccount = input.account;
  } else {
    emailRecord = await findEmailByMessageIdAllAccounts(input.messageId, accounts);
    foundAccount = emailRecord?.account || accounts[0];
  }

  if (!emailRecord) {
    return null;
  }

  // Fetch full email from IMAP
  const account = getAccount(config, foundAccount);
  if (!account) {
    throw new Error(`Account not found: ${foundAccount}`);
  }

  const imapConfig = createImapConfig(account);
  const client = new ImapClient(imapConfig);

  try {
    await client.connect();
    const fullEmail = await client.getMessage(emailRecord.uid, emailRecord.mailbox);
    await client.disconnect();

    if (!fullEmail) {
      // Return what we have from local DB without body
      return {
        messageId: emailRecord.messageId,
        uid: emailRecord.uid,
        account: foundAccount,
        mailbox: emailRecord.mailbox,
        subject: emailRecord.subject,
        from: emailRecord.from,
        to: emailRecord.to ? emailRecord.to.split(',') : [],
        date: new Date(emailRecord.date).toISOString(),
        body: emailRecord.snippet || '',
        hasAttachments: Boolean(emailRecord.hasAttachments),
        flags: emailRecord.flags ? emailRecord.flags.split(',') : [],
      };
    }

    return {
      messageId: fullEmail.messageId,
      uid: fullEmail.uid,
      account: foundAccount,
      mailbox: emailRecord.mailbox,
      subject: fullEmail.subject,
      from: fullEmail.from,
      to: fullEmail.to,
      date: fullEmail.date.toISOString(),
      body: (input.html && fullEmail.htmlBody) ? fullEmail.htmlBody : (fullEmail.body || ''),
      htmlBody: fullEmail.htmlBody,
      hasAttachments: fullEmail.hasAttachments,
      flags: fullEmail.flags,
    };
  } catch (error) {
    await client.disconnect().catch(() => {});
    throw error;
  }
}
