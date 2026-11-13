/**
 * Email Skill Type Definitions
 */

import type { MessageUID } from './imap/types';
import type { SignatureConfig, QuotingConfig } from './reply/types';

export interface EmailAccount {
  name: string;
  from: {
    name: string;
    email: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  imap?: {
    enabled: boolean;
    host: string;
    port: number;
    tls: boolean;
    auth?: {
      user: string;
      pass: string;
    };
    /** Mailboxes to sync (default: INBOX, Archive, Sent) */
    mailboxes?: string[];
  };
  /** Signature configuration for replies */
  signature?: SignatureConfig;
}

export interface EmailConfig {
  defaultAccount: string;
  accounts: Record<string, EmailAccount>;
  /** Global quoting configuration */
  quoting?: QuotingConfig;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  account?: string;
  markdown?: boolean;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  path?: string;
  content?: string | Buffer;
  contentType?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  account: string;
  from: string;
  to: string | string[];
  subject: string;
  error?: string;
}

// IMAP-specific types
export interface EmailMessage {
  uid: MessageUID;
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  date: Date;
  snippet: string;
  body?: string;
  htmlBody?: string;
  flags: string[];
  hasAttachments: boolean;
  size: number;
}

export interface FetchMessagesOptions {
  mailbox?: string;
  limit?: number;
  since?: Date;
  before?: Date;
  unseen?: boolean;
  search?: string[];
}

export interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  pass: string;
  connTimeout?: number;
  authTimeout?: number;
  keepalive?: boolean;
}

// Draft creation types
export interface CreateDraftOptions {
  to: string[];                    // Required: primary recipients
  cc?: string[];                   // Optional: CC recipients
  bcc?: string[];                  // Optional: BCC recipients
  subject: string;                 // Required: email subject
  body: string;                    // Required: plain text or markdown body
  html?: string;                   // Optional: pre-composed HTML body (overrides markdown)
  markdown?: boolean;              // Default: true (auto-detect)
  attachments?: EmailAttachment[]; // Optional: file attachments
  cidAttachments?: CidAttachment[]; // Optional: CID attachments for inline images
  account?: string;                // Optional: uses defaultAccount if omitted
  inReplyTo?: string;              // Optional: Message-ID for threading
  references?: string[];           // Optional: thread references
}

// CID attachment for inline images
export interface CidAttachment {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface DraftResult {
  success: boolean;
  uid?: MessageUID;                // IMAP UID of created draft
  messageId: string;               // Generated Message-ID
  account: string;                 // Account used
  mailbox: string;                 // Drafts mailbox path
  error?: string;                  // Error message if failed
}

// Clean Inbox types
export interface CleanInboxSession {
  account: string;
  startTime: Date;
  emails: CleanInboxEmail[];
  currentIndex: number;
  actions: SessionAction[];
  stats: SessionStats;
  options: CleanInboxOptions;
}

export interface CleanInboxEmail {
  uid: MessageUID;
  messageId: string;
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  date: Date;
  snippet: string;
  body?: string;  // Loaded on demand
  isRead: boolean;
  isAutomated: boolean;
}

export interface SessionAction {
  type: 'delete' | 'archive' | 'reply' | 'todo' | 'skip';
  emailUid: MessageUID;
  messageId: string;
  timestamp: Date;
  metadata?: ActionMetadata;
}

export interface ActionMetadata {
  draftUid?: MessageUID;
  draftMessageId?: string;
  tanaNodeId?: string;
  targetMailbox?: string;
  replyIntent?: string;
  todoDescription?: string;
}

export interface SessionStats {
  deleted: number;
  archived: number;
  replied: number;
  todos: number;
  skipped: number;
  total: number;
}

export interface CleanInboxOptions {
  account: string;
  limit?: number;
  replyOnly?: boolean;  // --reply-only flag
  quick?: boolean;      // --quick flag (no AI features)
  verbose?: boolean;
}
