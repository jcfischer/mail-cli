/**
 * Email Search Tools
 *
 * - email_search: Full-text search using FTS5
 * - email_semantic_search: AI-powered natural language search
 */

import { searchEmails } from '../../db/search';
import { EmailEmbeddingService } from '../../db/embedding-service';
import type { SearchInput, SemanticSearchInput } from '../schemas';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.config', 'email');

/**
 * Get embedding database path for an account
 */
function getEmbeddingsDbPath(account: string): string {
  return join(CONFIG_DIR, `embeddings-${account}.db`);
}

/**
 * Get the actual LanceDB directory path
 */
function getLanceDbPath(dbPath: string): string {
  return dbPath.replace(/\.db$/, '.lance');
}

export interface SearchResultItem {
  messageId: string;
  uid: number;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  mailbox: string;
  isRead: boolean;
  isStarred: boolean;
  priority: number;
  hasAttachments: boolean;
}

export interface SearchToolResult {
  account: string;
  query: string;
  results: SearchResultItem[];
  total: number;
}

/**
 * Full-text search using FTS5
 */
export async function search(input: SearchInput): Promise<SearchToolResult> {
  const results = await searchEmails(input.query, {
    account: input.account,
    mailbox: input.mailbox,
    limit: input.limit,
    unread: input.unread,
    from: input.from,
    to: input.to,
  });

  return {
    account: input.account,
    query: input.query,
    results: results.map((r) => ({
      messageId: r.messageId,
      uid: r.uid,
      subject: r.subject,
      from: r.from,
      date: new Date(r.date).toISOString(),
      snippet: r.snippet || '',
      mailbox: r.mailbox,
      isRead: Boolean(r.isRead),
      isStarred: Boolean(r.isStarred),
      priority: r.priority,
      hasAttachments: Boolean(r.hasAttachments),
    })),
    total: results.length,
  };
}

export interface SemanticSearchResultItem {
  messageId: string;
  similarity: number;
  subject?: string;
  from?: string;
  date?: string;
  contextText?: string;
}

export interface SemanticSearchToolResult {
  account: string;
  query: string;
  results: SemanticSearchResultItem[];
  total: number;
}

/**
 * AI-powered semantic search using embeddings
 */
export async function semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchToolResult> {
  const dbPath = getEmbeddingsDbPath(input.account);
  const lancePath = getLanceDbPath(dbPath);

  if (!existsSync(lancePath)) {
    return {
      account: input.account,
      query: input.query,
      results: [],
      total: 0,
    };
  }

  const embeddingService = new EmailEmbeddingService(dbPath, {
    sourceId: `email/${input.account}`,
  });

  try {
    const stats = await embeddingService.getStats();
    if (stats.totalEmbeddings === 0) {
      return {
        account: input.account,
        query: input.query,
        results: [],
        total: 0,
      };
    }

    // If filtering, fetch more results to have enough candidates
    const hasFilter = input.from || input.to;
    const searchLimit = hasFilter ? input.limit * 5 : input.limit;
    const fromFilter = input.from?.toLowerCase();
    const toFilter = input.to?.toLowerCase();

    const results = await embeddingService.search(input.query, searchLimit);

    // Enrich results with email metadata from local DB and apply filters
    const enrichedResults: SemanticSearchResultItem[] = [];
    for (const r of results) {
      const emails = await searchEmails('', {
        account: input.account,
        limit: 10000,
      });
      const email = emails.find((e) => e.messageId === r.id);

      // Apply from/to filters
      if (hasFilter && email) {
        const emailFrom = email.from.toLowerCase();
        const emailTo = email.to.toLowerCase();

        if (fromFilter && !emailFrom.includes(fromFilter)) {
          continue; // Skip if from doesn't match
        }
        if (toFilter && !emailTo.includes(toFilter)) {
          continue; // Skip if to doesn't match
        }
      }

      enrichedResults.push({
        messageId: r.id,
        similarity: r.similarity,
        subject: email?.subject,
        from: email?.from,
        date: email ? new Date(email.date).toISOString() : undefined,
        contextText: r.contextText,
      });

      // Stop if we have enough results
      if (enrichedResults.length >= input.limit) {
        break;
      }
    }

    return {
      account: input.account,
      query: input.query,
      results: enrichedResults,
      total: enrichedResults.length,
    };
  } finally {
    embeddingService.close();
  }
}
