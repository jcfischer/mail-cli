/**
 * DraftsStore backed by an account's IMAP Drafts mailbox.
 */

import type { CreateDraftOptions, EmailAccount } from '../types';
import { ImapClient, createImapConfig } from '../imap/client';
import { buildMessage } from './service';
import { REQUEST_DIGEST_HEADER, REQUEST_ID_HEADER, type DraftsStore, type StoredDraft } from './request';

export class ImapDraftsStore implements DraftsStore {
  readonly account: string;

  constructor(private readonly emailAccount: EmailAccount) {
    this.account = emailAccount.name;
  }

  async findByRequestId(requestId: string): Promise<StoredDraft | null> {
    return this.withDrafts(async (client, drafts) => {
      const hit = await client.findMessageByHeader(drafts, REQUEST_ID_HEADER, requestId);
      if (!hit) return null;
      return {
        messageId: hit.headers['message-id'] ?? '',
        digest: hit.headers[REQUEST_DIGEST_HEADER.toLowerCase()],
      };
    });
  }

  async save(options: CreateDraftOptions, headers: Record<string, string>): Promise<{ messageId: string }> {
    return this.withDrafts(async (client, drafts) => {
      const { message, messageId } = await buildMessage(options, this.emailAccount, headers);
      await client.appendMessage(drafts, message, ['\\Draft', '\\Seen']);
      return { messageId };
    });
  }

  private async withDrafts<T>(work: (client: ImapClient, drafts: string) => Promise<T>): Promise<T> {
    const client = new ImapClient(createImapConfig(this.emailAccount));
    await client.connect();
    try {
      return await work(client, await client.findDraftsMailbox());
    } finally {
      await client.disconnect().catch(() => {});
    }
  }
}
