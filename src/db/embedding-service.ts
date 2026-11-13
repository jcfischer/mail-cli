/**
 * Email Embedding Service
 * Semantic embeddings for email search using Resona
 */

import {
  EmbeddingService,
  OllamaProvider,
  type SearchResult,
  type EmbeddingStats,
  type BatchEmbedProgress,
  type BatchEmbedResult,
} from "resona";

/**
 * T-1.3: Chunking configuration constants
 */
const DEFAULT_MODEL = "bge-m3"; // T-1.2: Changed from mxbai-embed-large
const DEFAULT_CHUNK_SIZE = 18000; // ~5k tokens for bge-m3's 8k context
const DEFAULT_CHUNK_OVERLAP = 500; // Context continuity between chunks
const MAX_EMAIL_LENGTH = 100000; // Truncate emails beyond this length

/**
 * Email data for embedding
 * T-1.1: Added body field, removed snippet field
 */
export interface EmailToEmbed {
  id: string;
  subject: string;
  body: string;
  from: string;
  date: Date;
}

/**
 * Options for embedding operations
 */
export interface EmbedOptions {
  force?: boolean;
}

/**
 * Options for batch embedding
 * T-2.2: Added chunking options
 */
export interface BatchEmbedOptions {
  onProgress?: (progress: BatchEmbedProgress) => void;
  progressInterval?: number;
  force?: boolean;
  /** LanceDB write buffer size (default: 5000). Passed through to resona. */
  storeBatchSize?: number;
  /** Chunk size in characters (default: 18000). Passed through to resona. */
  chunkSize?: number;
  /** Chunk overlap in characters (default: 500). Passed through to resona. */
  chunkOverlap?: number;
}

/**
 * Result of embedding operation
 */
export interface EmbedResult {
  embedded: number;
  skipped: number;
  errors: number;
}

/**
 * Email Embedding Service
 * Wraps Resona's EmbeddingService for email-specific operations
 */
export class EmailEmbeddingService {
  private embeddingService: EmbeddingService;
  private sourceId: string;

  constructor(
    dbPath: string,
    options?: {
      sourceId?: string;
      model?: string;
      ollamaEndpoint?: string;
    }
  ) {
    this.sourceId = options?.sourceId ?? "email/default";
    // T-1.2: Use bge-m3 (8k context, 1024d) to match tana embeddings
    const model = options?.model ?? DEFAULT_MODEL;
    const endpoint = options?.ollamaEndpoint ?? "http://localhost:11434";

    const provider = new OllamaProvider(model, endpoint);
    this.embeddingService = new EmbeddingService(provider, dbPath);
  }

  /**
   * Get the source ID for this service
   */
  getSourceId(): string {
    return this.sourceId;
  }

  /**
   * Create text content for embedding from email
   * T-2.1: Use body instead of snippet, with truncation
   */
  private createEmbeddingText(email: EmailToEmbed): string {
    // T-1.3: Truncate body at MAX_EMAIL_LENGTH
    const truncatedBody = email.body.length > MAX_EMAIL_LENGTH
      ? email.body.substring(0, MAX_EMAIL_LENGTH)
      : email.body;

    const parts = [
      `Subject: ${email.subject}`,
      `From: ${email.from}`,
      `Body: ${truncatedBody}`,
    ];

    return parts.join("\n");
  }

  /**
   * Embed a single email
   */
  async embedEmail(email: EmailToEmbed, options?: EmbedOptions): Promise<EmbedResult> {
    const text = this.createEmbeddingText(email);

    try {
      // embed() returns boolean: true if embedded, false if skipped
      const wasEmbedded = await this.embeddingService.embed({
        id: email.id,
        text,
        metadata: {
          subject: email.subject,
          from: email.from,
          date: email.date.toISOString(),
        },
      });

      // If force is set and item was skipped, re-embed by deleting first
      if (options?.force && !wasEmbedded) {
        await this.embeddingService.delete(email.id);
        await this.embeddingService.embed({
          id: email.id,
          text,
          metadata: {
            subject: email.subject,
            from: email.from,
            date: email.date.toISOString(),
          },
        });
        return { embedded: 1, skipped: 0, errors: 0 };
      }

      return {
        embedded: wasEmbedded ? 1 : 0,
        skipped: wasEmbedded ? 0 : 1,
        errors: 0,
      };
    } catch {
      return { embedded: 0, skipped: 0, errors: 1 };
    }
  }

  /**
   * Embed multiple emails in batch
   * T-2.2: Pass chunking options to resona
   */
  async embedBatch(emails: EmailToEmbed[], options?: BatchEmbedOptions): Promise<EmbedResult> {
    const items = emails.map((email) => ({
      id: email.id,
      text: this.createEmbeddingText(email),
      metadata: {
        subject: email.subject,
        from: email.from,
        date: email.date.toISOString(),
      },
    }));

    const result = await this.embeddingService.embedBatch(items, {
      onProgress: options?.onProgress,
      progressInterval: options?.progressInterval,
      forceAll: options?.force,
      storeBatchSize: options?.storeBatchSize,
      chunkSize: options?.chunkSize ?? DEFAULT_CHUNK_SIZE,
      chunkOverlap: options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
    });

    // BatchEmbedResult uses 'processed' not 'embedded'
    return {
      embedded: result.processed,
      skipped: result.skipped,
      errors: result.errors,
    };
  }

  /**
   * Search for semantically similar emails
   */
  async search(query: string, k: number = 10): Promise<SearchResult[]> {
    return this.embeddingService.search(query, k);
  }

  /**
   * Get embedding statistics
   */
  async getStats(): Promise<EmbeddingStats> {
    return this.embeddingService.getStats();
  }

  /**
   * Cleanup embeddings not in the provided ID list
   */
  async cleanup(idsToKeep: string[]): Promise<number> {
    return this.embeddingService.cleanup(idsToKeep);
  }

  /**
   * Get list of embedded email IDs
   */
  async getEmbeddedIds(): Promise<string[]> {
    return this.embeddingService.getEmbeddedIds();
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.embeddingService.close();
  }
}
