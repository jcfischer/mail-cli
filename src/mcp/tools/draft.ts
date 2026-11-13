/**
 * Email Draft Tool
 *
 * - email_draft_create: Create draft email in Drafts mailbox
 */

import { loadConfig, getAccount } from '../../config';
import { createDraft } from '../../draft/service';
import type { DraftCreateInput } from '../schemas';
import type { DraftResult } from '../../types';

/**
 * Create draft email in Drafts mailbox
 */
export async function draftCreate(input: DraftCreateInput): Promise<DraftResult> {
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

  const result = await createDraft(
    {
      to: toArray,
      cc: ccArray,
      bcc: bccArray,
      subject: input.subject,
      body: input.body,
      markdown: input.markdown,
      inReplyTo: input.inReplyTo,
      references: input.references,
    },
    account
  );

  return result;
}
