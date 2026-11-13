/**
 * IMAP Client for Email Reading (using ImapFlow)
 * Handles connection, mailbox operations, and message fetching
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailAccount, EmailMessage, FetchMessagesOptions, ImapConfig } from '../types';
import { UID_OPTIONS, MessageUID } from './types';

/**
 * Create IMAP configuration from account
 */
export function createImapConfig(account: EmailAccount): ImapConfig {
  // If IMAP config exists and is enabled, use it
  if (account.imap?.enabled) {
    return {
      host: account.imap.host,
      port: account.imap.port,
      tls: account.imap.tls,
      user: account.imap.auth?.user || account.smtp.auth.user,
      pass: account.imap.auth?.pass || account.smtp.auth.pass,
      connTimeout: 10000,
      authTimeout: 5000,
      keepalive: true,
    };
  }

  // Otherwise, derive IMAP config from SMTP config
  const smtpHost = account.smtp.host;
  let imapHost = smtpHost;
  let imapPort = 993;
  let useTls = true;

  // Try to derive IMAP hostname from SMTP
  // Pattern 1: smtp.example.com -> imap.example.com
  if (smtpHost.includes('smtp')) {
    imapHost = smtpHost.replace('smtp', 'imap');
  }
  // Pattern 2: mail.example.com -> mail.example.com (same host)
  // Pattern 3: mail.provider.example -> mail.provider.example (same host)
  // These patterns use the same hostname for both SMTP and IMAP

  // Determine port and TLS mode based on SMTP configuration
  // If SMTP uses STARTTLS (port 587, secure: false), use IMAP STARTTLS (port 143)
  // If SMTP uses SSL/TLS (port 465, secure: true), use IMAP SSL/TLS (port 993)
  if (account.smtp.port === 587 && !account.smtp.secure) {
    // SMTP with STARTTLS -> IMAP with STARTTLS
    imapPort = 143;
    useTls = false; // STARTTLS, not direct TLS
  } else if (account.smtp.port === 465 || account.smtp.secure) {
    // SMTP with SSL/TLS -> IMAP with SSL/TLS
    imapPort = 993;
    useTls = true;
  }

  return {
    host: imapHost,
    port: imapPort,
    tls: useTls,
    user: account.smtp.auth.user,
    pass: account.smtp.auth.pass,
    connTimeout: 10000,
    authTimeout: 5000,
    keepalive: true,
  };
}

/**
 * IMAP Client wrapper using ImapFlow
 */
export class ImapClient {
  private client: ImapFlow;
  private config: ImapConfig;
  private readonly FETCH_BATCH_SIZE = 50; // Max UIDs per FETCH command

  constructor(config: ImapConfig) {
    this.config = config;

    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.tls,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      logger: false, // Disable debug logging
    });
  }

  /**
   * Split array into chunks to avoid IMAP command length limits
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // ===== Private UID Helper Methods =====
  // These ensure all IMAP operations use UID mode via centralized UID_OPTIONS

  /**
   * Add flags to a message using UID mode
   * @internal Used by markAsRead, deleteMessage, etc.
   */
  private async uidFlagsAdd(uid: MessageUID, flags: string[]): Promise<void> {
    await this.client.messageFlagsAdd(String(uid), flags, UID_OPTIONS);
  }

  /**
   * Remove flags from a message using UID mode
   * @internal Used by markAsUnread, etc.
   */
  private async uidFlagsRemove(uid: MessageUID, flags: string[]): Promise<void> {
    await this.client.messageFlagsRemove(String(uid), flags, UID_OPTIONS);
  }

  /**
   * Move a message to another mailbox using UID mode
   * @internal Used by moveMessage
   */
  private async uidMove(uid: MessageUID, target: string): Promise<void> {
    await this.client.messageMove(String(uid), target, UID_OPTIONS);
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    await this.client.logout();
  }

  /**
   * List all available mailboxes
   */
  async listMailboxes(): Promise<Array<{ name: string; path: string; specialUse?: string }>> {
    const mailboxes = await this.client.list();
    return mailboxes.map((box: any) => ({
      name: box.name,
      path: box.path,
      specialUse: box.specialUse,
    }));
  }

  /**
   * Fetch messages from mailbox
   */
  async fetchMessages(options: FetchMessagesOptions = {}): Promise<EmailMessage[]> {
    const { mailbox = 'INBOX', limit = 50, unseen = false, since, before } = options;

    // Open mailbox
    await this.client.mailboxOpen(mailbox);

    // Build search criteria
    const searchCriteria: any = {};

    if (unseen) {
      searchCriteria.seen = false;
    }

    if (since) {
      searchCriteria.since = since;
    }

    if (before) {
      searchCriteria.before = before;
    }

    // Search for messages
    const messages: EmailMessage[] = [];

    // Get all messages matching criteria
    let messageList;
    if (Object.keys(searchCriteria).length > 0) {
      messageList = await this.client.search(searchCriteria);
    } else {
      messageList = await this.client.search({ all: true });
    }

    // Limit results (only if limit is provided and > 0)
    // For batch operations, we want ALL matching messages, not just recent ones
    const limitedList = (limit && limit > 0) ? messageList.slice(-limit) : messageList;

    // Batch FETCH operations to avoid command length limits
    const batches = this.chunkArray(limitedList, this.FETCH_BATCH_SIZE);

    // Fetch message details in batches
    for (const batch of batches) {
      for await (const msg of this.client.fetch(batch, {
        envelope: true,
        bodyStructure: true,
        flags: true,
        size: true,
        uid: true,
        source: true, // Get full message source for proper MIME parsing
      })) {
        // Parse envelope
        const envelope = msg.envelope;
        const from = envelope.from?.[0]
          ? `${envelope.from[0].name || ''} <${envelope.from[0].address}>`.trim()
          : '';

        const to = envelope.to?.map(addr => addr.address || '') || [];
        const subject = envelope.subject || '(no subject)';
        const date = envelope.date || new Date();

        let bodyText = '';
        let htmlBody: string | undefined;

        // Use mailparser for proper MIME decoding (handles quoted-printable, base64, etc.)
        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            bodyText = parsed.text || '';
            htmlBody = parsed.html || undefined;
          } catch {
            // Fallback: use manual decoding
            const source = Buffer.from(msg.source).toString('utf-8');
            const decodedBody = this.decodeEmailBody(source);

            // Check if it's HTML content
            const htmlMatch = decodedBody.match(/<html[^>]*>([\s\S]*?)<\/html>/i) ||
                             decodedBody.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (htmlMatch) {
              htmlBody = htmlMatch[0];
              bodyText = this.stripHtml(htmlBody);
            } else if (decodedBody.includes('<') && decodedBody.includes('>')) {
              bodyText = this.stripHtml(decodedBody);
            } else {
              bodyText = decodedBody;
            }
          }
        }

        // Get snippet (first 200 chars)
        const snippet = bodyText.substring(0, 200).replace(/\s+/g, ' ').trim();

        // Check for attachments
        const hasAttachments = this.hasAttachments(msg.bodyStructure);

        messages.push({
          uid: MessageUID(msg.uid),
          messageId: envelope.messageId || `${msg.uid}`,
          from,
          to,
          subject,
          date,
          snippet,
          body: bodyText,
          htmlBody,
          flags: msg.flags ? Array.from(msg.flags) : [],
          hasAttachments,
          size: msg.size || 0,
        });
      }
    }

    // Sort by date descending (newest first)
    messages.sort((a, b) => b.date.getTime() - a.date.getTime());

    return messages;
  }

  /**
   * Check if message has attachments
   */
  private hasAttachments(bodyStructure: any): boolean {
    if (!bodyStructure) return false;

    // Check if any part has a disposition of 'attachment'
    const checkPart = (part: any): boolean => {
      if (part.disposition === 'attachment') return true;
      if (part.childNodes) {
        return part.childNodes.some((child: any) => checkPart(child));
      }
      return false;
    };

    return checkPart(bodyStructure);
  }

  /**
   * Strip HTML tags and decode entities for plain text extraction
   */
  private stripHtml(html: string): string {
    return html
      // Remove script and style blocks
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Decode quoted-printable encoding with proper UTF-8 handling
   */
  private decodeQuotedPrintable(text: string): string {
    // First, join soft line breaks (= at end of line)
    const joined = text.replace(/=\r?\n/g, '');

    // Convert hex codes to bytes
    const bytes: number[] = [];
    let i = 0;
    while (i < joined.length) {
      if (joined[i] === '=' && /[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))) {
        bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
        i += 3;
      } else {
        bytes.push(joined.charCodeAt(i));
        i++;
      }
    }

    // Decode as UTF-8
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }

  /**
   * Decode base64 encoding with proper UTF-8 handling
   */
  private decodeBase64(text: string): string {
    try {
      // Remove whitespace and line breaks
      const cleaned = text.replace(/\s/g, '');
      const decoded = atob(cleaned);
      // Convert to proper UTF-8
      return new TextDecoder('utf-8').decode(
        new Uint8Array([...decoded].map(c => c.charCodeAt(0)))
      );
    } catch {
      return '';
    }
  }

  /**
   * Decode a single MIME part (extract body and decode based on Content-Transfer-Encoding)
   */
  private decodeMimePart(part: string): string {
    const headerBodySplit = part.split(/\r?\n\r?\n/);
    if (headerBodySplit.length < 2) return '';

    const headers = headerBodySplit[0];
    let body = headerBodySplit.slice(1).join('\n\n');

    // Check for Content-Transfer-Encoding (case-insensitive)
    const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(headers);
    const isQuotedPrintable = /Content-Transfer-Encoding:\s*quoted-printable/i.test(headers);

    if (isBase64) {
      body = this.decodeBase64(body);
    } else if (isQuotedPrintable) {
      body = this.decodeQuotedPrintable(body);
    }

    return body;
  }

  /**
   * Decode email body based on Content-Transfer-Encoding header
   * Handles base64 and quoted-printable encodings, including multipart MIME
   */
  private decodeEmailBody(source: string): string {
    // Split headers from body
    const headerBodySplit = source.split(/\r?\n\r?\n/);
    if (headerBodySplit.length < 2) return source;

    const headers = headerBodySplit[0];
    const body = headerBodySplit.slice(1).join('\n\n');

    // Check if this is multipart content
    const boundaryMatch = headers.match(/boundary="?([^"\s;]+)"?/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      return this.decodeMultipartBody(body, boundary);
    }

    // Single part - decode directly
    return this.decodeMimePart(source);
  }

  /**
   * Decode multipart MIME body - find and decode the best text part
   * Prefers text/plain over text/html
   */
  private decodeMultipartBody(body: string, boundary: string): string {
    // Escape special regex characters in boundary
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = body.split(new RegExp(`--${escapedBoundary}`));

    // First pass: look for text/plain
    for (const part of parts) {
      if (part.includes('Content-Type: text/plain') && !part.includes('Content-Type: multipart')) {
        const decoded = this.decodeMimePart(part);
        if (decoded && decoded.length > 10) {
          return decoded;
        }
      }
    }

    // Second pass: look for text/html and strip tags
    for (const part of parts) {
      if (part.includes('Content-Type: text/html') && !part.includes('Content-Type: multipart')) {
        const decoded = this.decodeMimePart(part);
        if (decoded) {
          return this.stripHtml(decoded);
        }
      }
    }

    // Fallback: return body as-is
    return body;
  }

  /**
   * Get a single message by UID
   */
  async getMessage(uid: number, mailbox: string = 'INBOX'): Promise<EmailMessage | null> {
    // Open mailbox
    await this.client.mailboxOpen(mailbox);

    // Fetch single message by UID
    // ImapFlow requires uid: true in options to fetch by UID instead of sequence number
    const messages: EmailMessage[] = [];

    for await (const msg of this.client.fetch(String(uid), {
      envelope: true,
      bodyStructure: true,
      flags: true,
      size: true,
      uid: true,
      source: true, // Get full message source
    }, UID_OPTIONS)) {
      const envelope = msg.envelope;
      const from = envelope.from?.[0]
        ? `${envelope.from[0].name || ''} <${envelope.from[0].address}>`.trim()
        : '';

      const to = envelope.to?.map(addr => addr.address || '') || [];
      const subject = envelope.subject || '(no subject)';
      const date = envelope.date || new Date();

      // Parse full message for body
      let bodyText = '';
      let htmlBody: string | undefined;

      // Use mailparser for proper MIME decoding (handles quoted-printable, base64, etc.)
      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source);
          bodyText = parsed.text || '';
          htmlBody = parsed.html || undefined;
        } catch {
          // Fallback: use manual decoding
          const source = Buffer.from(msg.source).toString('utf-8');
          const decodedBody = this.decodeEmailBody(source);

          // Check if it's HTML content
          const htmlMatch = decodedBody.match(/<html[^>]*>([\s\S]*?)<\/html>/i) ||
                           decodedBody.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (htmlMatch) {
            htmlBody = htmlMatch[0];
            bodyText = this.stripHtml(htmlBody);
          } else if (decodedBody.includes('<') && decodedBody.includes('>')) {
            bodyText = this.stripHtml(decodedBody);
          } else {
            bodyText = decodedBody;
          }
        }
      }

      const snippet = bodyText.substring(0, 200).replace(/\n/g, ' ');
      const hasAttachments = this.hasAttachments(msg.bodyStructure);

      messages.push({
        uid: MessageUID(msg.uid),
        messageId: envelope.messageId || `${msg.uid}`,
        from,
        to,
        subject,
        date,
        snippet,
        body: bodyText,
        htmlBody,
        flags: msg.flags ? Array.from(msg.flags) : [],
        hasAttachments,
        size: msg.size || 0,
      });
    }

    return messages.length > 0 ? messages[0] : null;
  }

  /**
   * Mark message as read
   */
  async markAsRead(uid: number, mailbox: string = 'INBOX'): Promise<void> {
    await this.client.mailboxOpen(mailbox);
    await this.uidFlagsAdd(uid as MessageUID, ['\\Seen']);
  }

  /**
   * Mark message as unread
   */
  async markAsUnread(uid: number, mailbox: string = 'INBOX'): Promise<void> {
    await this.client.mailboxOpen(mailbox);
    await this.uidFlagsRemove(uid as MessageUID, ['\\Seen']);
  }

  /**
   * Delete message (mark as deleted)
   * Note: Call expungeDeleted() after to permanently remove flagged messages
   */
  async deleteMessage(uid: number, mailbox: string = 'INBOX'): Promise<void> {
    await this.client.mailboxOpen(mailbox);
    await this.uidFlagsAdd(uid as MessageUID, ['\\Deleted']);
  }

  /**
   * Expunge (permanently remove) all messages marked as deleted
   * IMAP requires EXPUNGE command to actually remove messages with \Deleted flag
   *
   * @param mailbox - Mailbox to expunge (default: INBOX)
   */
  async expungeDeleted(mailbox: string = 'INBOX'): Promise<void> {
    await this.client.mailboxOpen(mailbox);
    await this.client.messageDelete({ deleted: true });
  }

  /**
   * Move message to another mailbox
   */
  async moveMessage(uid: number, targetMailbox: string, sourceMailbox: string = 'INBOX'): Promise<void> {
    await this.client.mailboxOpen(sourceMailbox);
    await this.uidMove(uid as MessageUID, targetMailbox);
  }

  /**
   * Get list of mailboxes
   */
  async getMailboxes(): Promise<string[]> {
    const list = await this.client.list();
    return list.map(box => box.path);
  }

  /**
   * Append a message to a mailbox (for draft creation)
   * Uses IMAP APPEND command to add a raw message to specified mailbox
   *
   * @param mailbox - Target mailbox path (e.g., 'Drafts')
   * @param message - Raw RFC 2822 message as Buffer
   * @param flags - IMAP flags to set (e.g., ['\\Draft', '\\Seen'])
   * @returns UID of the appended message as MessageUID
   */
  async appendMessage(
    mailbox: string,
    message: Buffer,
    flags: string[] = ['\\Draft', '\\Seen']
  ): Promise<MessageUID> {
    const result = await this.client.append(mailbox, message, flags);
    // ImapFlow append returns { destination, uid, uidValidity }
    return MessageUID(result.uid);
  }

  /**
   * Find the Drafts mailbox by special-use attribute or common names
   * IMAP servers use \Drafts special-use flag (RFC 6154)
   *
   * @returns Mailbox path for Drafts folder
   * @throws Error if no Drafts mailbox found
   */
  async findDraftsMailbox(): Promise<string> {
    const mailboxes = await this.client.list();

    // First, look for special-use \Drafts attribute
    for (const box of mailboxes) {
      if (box.specialUse === '\\Drafts') {
        return box.path;
      }
    }

    // Fallback: Look for common draft folder names
    const commonNames = ['Drafts', 'Draft', 'DRAFTS', '[Gmail]/Drafts'];
    for (const name of commonNames) {
      const found = mailboxes.find(
        (box: any) => box.path === name || box.name === name
      );
      if (found) {
        return found.path;
      }
    }

    throw new Error('Could not find Drafts mailbox. Available mailboxes: ' +
      mailboxes.map((b: any) => b.path).join(', '));
  }

  /**
   * Fetch email bodies by UIDs using mailparser for proper MIME handling
   * This is optimized for batch embedding operations.
   *
   * @param uids - UIDs to fetch
   * @param mailbox - Mailbox to fetch from
   * @param onProgress - Progress callback
   * @returns Map of UID -> body text
   */
  async fetchBodiesByUid(
    uids: number[],
    mailbox: string = 'INBOX',
    onProgress?: (fetched: number, total: number) => void,
    verbose: boolean = false
  ): Promise<Map<number, string>> {
    await this.client.mailboxOpen(mailbox);

    const bodies = new Map<number, string>();
    const batches = this.chunkArray(uids, this.FETCH_BATCH_SIZE);
    let totalFetched = 0;
    const startTime = Date.now();
    let batchNumber = 0;

    for (const batch of batches) {
      batchNumber++;
      const batchStartTime = Date.now();

      if (verbose) {
        console.log(`   📦 Batch ${batchNumber}/${batches.length}: Processing ${batch.length} UIDs...`);
      }

      for await (const msg of this.client.fetch(batch, {
        uid: true,
        source: true,  // Get full message source for mailparser
      }, UID_OPTIONS)) {  // Use centralized UID_OPTIONS to fetch by UID, not sequence number
        let body = "";

        if (msg.source) {
          try {
            // Use mailparser for proper MIME decoding
            const parsed = await simpleParser(msg.source);
            body = parsed.text || "";
          } catch {
            // Fallback: extract text after headers
            const source = Buffer.from(msg.source).toString("utf-8");
            const bodyMatch = source.match(/\r?\n\r?\n([\s\S]*)/);
            if (bodyMatch) {
              body = bodyMatch[1];
            }
          }
        }

        bodies.set(msg.uid, body.trim());
        totalFetched++;

        if (onProgress) {
          onProgress(totalFetched, uids.length);
        }
      }

      if (verbose) {
        const batchDuration = (Date.now() - batchStartTime) / 1000;
        const batchRate = batch.length / batchDuration;
        console.log(`   ✅ Batch ${batchNumber}/${batches.length}: ${batch.length} messages in ${batchDuration.toFixed(1)}s (${batchRate.toFixed(1)} msg/s)`);
      }
    }

    if (verbose) {
      const totalDuration = (Date.now() - startTime) / 1000;
      const overallRate = totalFetched / totalDuration;
      console.log(`   📊 Total: ${totalFetched} messages in ${totalDuration.toFixed(1)}s (${overallRate.toFixed(1)} msg/s average)`);
    }

    return bodies;
  }
}

/**
 * Convenience function to fetch messages from an account
 */
export async function fetchEmailMessages(
  account: EmailAccount,
  options: FetchMessagesOptions = {}
): Promise<EmailMessage[]> {
  const config = createImapConfig(account);
  const client = new ImapClient(config);

  try {
    await client.connect();
    const messages = await client.fetchMessages(options);
    await client.disconnect();
    return messages;
  } catch (error) {
    await client.disconnect();
    throw error;
  }
}
