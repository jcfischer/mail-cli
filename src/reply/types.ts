/**
 * Reply Composer Types
 * Types for composing email replies with signatures and quoted content
 */

/**
 * Signature configuration for an email account
 */
export interface SignatureConfig {
  /** Path to HTML signature file (default: ~/.config/email/signatures/{account}.html) */
  path?: string;
  /** Disable signature for this account (default: true) */
  enabled?: boolean;
  /** Path to plain text fallback signature */
  textPath?: string;
}

/**
 * Global quoting configuration
 */
export interface QuotingConfig {
  /** Max bytes before truncation (default: 102400 = 100KB) */
  maxQuoteLength?: number;
}

/**
 * Embedded image for CID attachment
 */
export interface EmbeddedImage {
  /** Content-ID without angle brackets (e.g., "logo") */
  cid: string;
  /** Original filename */
  filename: string;
  /** Image data as Buffer */
  content: Buffer;
  /** MIME type (e.g., "image/png") */
  contentType: string;
}

/**
 * Loaded signature with optional embedded images
 */
export interface LoadedSignature {
  /** HTML signature content */
  html: string;
  /** Plain text fallback */
  text?: string;
  /** CID attachments for inline images */
  attachments: EmbeddedImage[];
}

/**
 * Options for composing a reply
 */
export interface ComposeReplyOptions {
  /** AI-generated or user-provided reply text */
  replyText: string;
  /** Original email being replied to */
  originalEmail: {
    /** Sender display name or email address */
    from: string;
    /** Original email date */
    date: Date;
    /** Plain text body */
    body: string;
    /** HTML body if available */
    htmlBody?: string;
  };
  /** Loaded signature (optional) */
  signature?: LoadedSignature;
  /** Max bytes before truncating quoted content (default: 102400) */
  maxQuoteLength?: number;
}

/**
 * Result of quoted content formatting
 */
export interface QuotedContent {
  /** Plain text with > prefixes */
  plainText: string;
  /** HTML with blockquote */
  html: string;
  /** Whether content was truncated */
  truncated: boolean;
}

/**
 * Composed reply ready for draft creation
 */
export interface ComposedReply {
  /** Full plain text body */
  plainText: string;
  /** Full HTML body */
  html: string;
  /** CID attachments for nodemailer */
  attachments: EmbeddedImage[];
}
