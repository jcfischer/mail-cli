/**
 * Request-ID drafts: save a draft at most once per request ID, and find it again.
 *
 * A caller that may retry (an agent, a queue worker) passes a request ID. The
 * draft carries the ID and a digest of its content as headers, so a repeat
 * finds the existing draft instead of saving a second one, and a lookup can
 * answer whether the draft is still in the Drafts mailbox.
 */

import { createHash } from 'crypto';
import type { CreateDraftOptions } from '../types';

export const REQUEST_ID_HEADER = 'X-Mail-Request-Id';
export const REQUEST_DIGEST_HEADER = 'X-Mail-Request-Digest';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:@-]{1,200}$/;

export function validateRequestId(requestId: string): string | undefined {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return 'request ID must be 1-200 characters of letters, digits and . _ : @ -';
  }
  return undefined;
}

export function draftDigest(options: CreateDraftOptions): string {
  const content = {
    to: options.to,
    cc: options.cc ?? [],
    bcc: options.bcc ?? [],
    subject: options.subject,
    body: options.body,
    inReplyTo: options.inReplyTo ?? null,
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export interface StoredDraft {
  messageId: string;
  digest?: string;
}

/** The Drafts mailbox of one account, as seen by the request-ID logic. */
export interface DraftsStore {
  readonly account: string;
  findByRequestId(requestId: string): Promise<StoredDraft | null>;
  save(options: CreateDraftOptions, headers: Record<string, string>): Promise<{ messageId: string }>;
}

export type RequestDraftResult = {
  status: 'created' | 'exists' | 'conflict';
  id: string;
  account: string;
};

export type RequestLookupResult =
  | { status: 'found'; id: string; account: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/**
 * Save the draft unless one with this request ID is already in Drafts.
 * Same ID and same content answers `exists`; same ID with other content answers
 * `conflict`. Neither saves a second draft.
 */
export async function saveDraftOnce(
  store: DraftsStore,
  requestId: string,
  options: CreateDraftOptions,
): Promise<RequestDraftResult> {
  const invalid = validateRequestId(requestId);
  if (invalid) throw new Error(invalid);

  const digest = draftDigest(options);
  const existing = await store.findByRequestId(requestId);
  if (existing) {
    const status = existing.digest === digest ? 'exists' : 'conflict';
    return { status, id: existing.messageId, account: store.account };
  }

  const { messageId } = await store.save(options, {
    [REQUEST_ID_HEADER]: requestId,
    [REQUEST_DIGEST_HEADER]: digest,
  });
  return { status: 'created', id: messageId, account: store.account };
}

/**
 * Look the request ID up in each store. A draft found anywhere answers `found`.
 * Otherwise an unreachable store answers `unavailable`, because the draft may be
 * there; only when every store answered does the lookup say `not_found`.
 */
export async function lookupDraft(
  stores: DraftsStore[],
  requestId: string,
): Promise<RequestLookupResult> {
  const invalid = validateRequestId(requestId);
  if (invalid) throw new Error(invalid);

  let unreachable = false;
  for (const store of stores) {
    try {
      const found = await store.findByRequestId(requestId);
      if (found) return { status: 'found', id: found.messageId, account: store.account };
    } catch {
      unreachable = true;
    }
  }
  return unreachable || stores.length === 0 ? { status: 'unavailable' } : { status: 'not_found' };
}
