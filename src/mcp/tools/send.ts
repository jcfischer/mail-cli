/**
 * Email Send Tool
 *
 * - email_send: Send email via SMTP
 */

import { loadConfig, getAccount } from '../../config';
import { sendEmail } from '../../sender';
import type { SendInput } from '../schemas';

export interface SendToolResult {
  success: boolean;
  messageId?: string;
  account: string;
  to: string[];
  subject: string;
  error?: string;
}

/**
 * Send email via SMTP
 */
export async function send(input: SendInput): Promise<SendToolResult> {
  const config = loadConfig();
  const accountName = input.account || config.defaultAccount;

  if (!accountName) {
    throw new Error('No account specified and no default account configured');
  }

  const account = getAccount(config, accountName);
  if (!account) {
    throw new Error(`Account not found: ${accountName}`);
  }

  // Normalize recipients to arrays
  const toArray = Array.isArray(input.to) ? input.to : [input.to];
  const ccArray = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : undefined;
  const bccArray = input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined;

  try {
    const result = await sendEmail(account, {
      to: toArray,
      cc: ccArray,
      bcc: bccArray,
      subject: input.subject,
      body: input.body,
      markdown: input.markdown,
    });

    return {
      success: result.success,
      messageId: result.messageId,
      account: accountName,
      to: toArray,
      subject: input.subject,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      account: accountName,
      to: toArray,
      subject: input.subject,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
