import { describe, it, expect } from 'bun:test';
import {
  REQUEST_DIGEST_HEADER,
  REQUEST_ID_HEADER,
  lookupDraft,
  saveDraftOnce,
  validateRequestId,
  type DraftsStore,
  type StoredDraft,
} from '../../src/draft/request';
import { buildMessage } from '../../src/draft/service';
import { parseHeaderBlock } from '../../src/imap/client';
import { createDraftCommand } from '../../src/commands/draft';
import type { CreateDraftOptions, EmailAccount } from '../../src/types';

class MemoryDrafts implements DraftsStore {
  drafts: Array<{ headers: Record<string, string>; messageId: string }> = [];
  constructor(readonly account = 'account-1', private down = false) {}

  async findByRequestId(requestId: string): Promise<StoredDraft | null> {
    if (this.down) throw new Error('connection refused');
    const hit = this.drafts.find((d) => d.headers[REQUEST_ID_HEADER] === requestId);
    return hit ? { messageId: hit.messageId, digest: hit.headers[REQUEST_DIGEST_HEADER] } : null;
  }

  async save(_options: CreateDraftOptions, headers: Record<string, string>) {
    const messageId = `<draft-${this.drafts.length + 1}@example.invalid>`;
    this.drafts.push({ headers, messageId });
    return { messageId };
  }
}

const draft = (over: Partial<CreateDraftOptions> = {}): CreateDraftOptions => ({
  to: ['to@example.invalid'],
  subject: 'Subject',
  body: 'Body',
  ...over,
});

describe('saveDraftOnce', () => {
  it('saves one draft stamped with the request ID', async () => {
    const store = new MemoryDrafts();
    const result = await saveDraftOnce(store, 'req-1', draft());
    expect(result).toEqual({ status: 'created', id: '<draft-1@example.invalid>', account: 'account-1' });
    expect(store.drafts).toHaveLength(1);
    expect(store.drafts[0].headers[REQUEST_ID_HEADER]).toBe('req-1');
  });

  it('answers a repeat with the same draft and saves no second one', async () => {
    const store = new MemoryDrafts();
    const first = await saveDraftOnce(store, 'req-1', draft());
    const again = await saveDraftOnce(store, 'req-1', draft());
    expect(again).toEqual({ status: 'exists', id: first.id, account: 'account-1' });
    expect(store.drafts).toHaveLength(1);
  });

  it('answers the same ID with other content as a conflict and saves nothing', async () => {
    const store = new MemoryDrafts();
    const first = await saveDraftOnce(store, 'req-1', draft());
    const clash = await saveDraftOnce(store, 'req-1', draft({ body: 'Other body' }));
    expect(clash).toEqual({ status: 'conflict', id: first.id, account: 'account-1' });
    expect(store.drafts).toHaveLength(1);
  });

  it('rejects a request ID that could inject a header', async () => {
    const store = new MemoryDrafts();
    await expect(saveDraftOnce(store, 'req-1\r\nBcc: x@example.invalid', draft())).rejects.toThrow();
    expect(store.drafts).toHaveLength(0);
  });
});

describe('lookupDraft', () => {
  it('finds a saved draft by request ID', async () => {
    const store = new MemoryDrafts();
    const saved = await saveDraftOnce(store, 'req-1', draft());
    expect(await lookupDraft([store], 'req-1')).toEqual({ status: 'found', id: saved.id, account: 'account-1' });
  });

  it('answers not_found once the draft is removed by hand', async () => {
    const store = new MemoryDrafts();
    await saveDraftOnce(store, 'req-1', draft());
    store.drafts = [];
    expect(await lookupDraft([store], 'req-1')).toEqual({ status: 'not_found' });
  });

  it('answers unavailable when a store cannot be reached and nothing was found', async () => {
    const up = new MemoryDrafts('account-1');
    const down = new MemoryDrafts('account-2', true);
    expect(await lookupDraft([up, down], 'req-1')).toEqual({ status: 'unavailable' });
    expect(await lookupDraft([], 'req-1')).toEqual({ status: 'unavailable' });
  });

  it('answers found from a reachable store even when another is down', async () => {
    const up = new MemoryDrafts('account-1');
    await saveDraftOnce(up, 'req-1', draft());
    const down = new MemoryDrafts('account-2', true);
    expect((await lookupDraft([down, up], 'req-1')).status).toBe('found');
  });
});

describe('request ID on the saved message', () => {
  const account: EmailAccount = {
    name: 'test',
    from: { name: 'Test User', email: 'test@example.invalid' },
    smtp: { host: 'smtp.example.invalid', port: 587, secure: false, auth: { user: 'u', pass: 'p' } },
  };

  it('writes the request headers so a header read finds them', async () => {
    const { message, messageId } = await buildMessage(draft(), account, {
      [REQUEST_ID_HEADER]: 'req-1',
      [REQUEST_DIGEST_HEADER]: 'abc',
    });
    const raw = message.toString('utf-8');
    const headers = parseHeaderBlock(raw.slice(0, raw.search(/\r?\n\r?\n/)));
    expect(headers['x-mail-request-id']).toBe('req-1');
    expect(headers['x-mail-request-digest']).toBe('abc');
    expect(headers['message-id']).toBe(messageId);
  });

  it('unfolds folded header lines', () => {
    expect(parseHeaderBlock('Subject: a\r\n b\r\nX-Mail-Request-Id: req-1\r\n')).toEqual({
      subject: 'a b',
      'x-mail-request-id': 'req-1',
    });
  });
});

describe('validateRequestId', () => {
  it('accepts ordinary IDs and rejects empty or spaced ones', () => {
    expect(validateRequestId('req-1')).toBeUndefined();
    expect(validateRequestId('flow:42.a_b@x')).toBeUndefined();
    expect(validateRequestId('')).toBeDefined();
    expect(validateRequestId('a b')).toBeDefined();
  });
});

describe('draft CLI', () => {
  it('offers --request-id on create and a lookup command', () => {
    const command = createDraftCommand();
    const create = command.commands.find((c) => c.name() === 'create');
    expect(create?.options.some((o) => o.long === '--request-id')).toBe(true);
    expect(command.commands.some((c) => c.name() === 'lookup')).toBe(true);
  });
});
