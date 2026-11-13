/**
 * Draft Service - Email Draft Creation
 * Creates RFC 2822 compliant messages for IMAP APPEND
 */

import MailComposer from 'nodemailer/lib/mail-composer';
import { marked } from 'marked';
import type { CreateDraftOptions, DraftResult, EmailAccount } from '../types';
import type { EmbeddedImage } from '../reply/types';
import { ImapClient, createImapConfig } from '../imap/client';

/**
 * Result from buildMessage
 */
export interface BuildMessageResult {
  message: Buffer;
  messageId: string;
}

/**
 * Simple markdown detection heuristics
 */
function looksLikeMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+.+$/m,           // Headers
    /\*\*.+\*\*/,               // Bold
    /\*.+\*/,                   // Italic
    /^[-*+]\s+.+$/m,            // Lists
    /^\d+\.\s+.+$/m,            // Numbered lists
    /\[.+\]\(.+\)/,             // Links
    /```[\s\S]*```/,            // Code blocks
    /`[^`]+`/,                  // Inline code
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}

/**
 * Build an RFC 2822 MIME message from draft options
 * Uses nodemailer's MailComposer for proper MIME encoding
 *
 * @param options - Draft creation options
 * @param account - Email account for From header
 * @returns Buffer containing raw RFC 2822 message and generated Message-ID
 */
export async function buildMessage(
  options: CreateDraftOptions,
  account: EmailAccount
): Promise<BuildMessageResult> {
  const { to, cc, bcc, subject, body, html, markdown, inReplyTo, references, attachments, cidAttachments } = options;

  // Build mail options for MailComposer
  const mailOptions: any = {
    from: {
      name: account.from.name,
      address: account.from.email,
    },
    to: to.join(', '),
    subject,
  };

  // Add CC/BCC if provided
  if (cc && cc.length > 0) {
    mailOptions.cc = cc.join(', ');
  }
  if (bcc && bcc.length > 0) {
    mailOptions.bcc = bcc.join(', ');
  }

  // Handle body - priority: pre-composed HTML > markdown > plain text
  if (html) {
    // Use pre-composed HTML directly (from reply composer)
    mailOptions.text = body;
    mailOptions.html = html;
  } else {
    // Determine if we should render markdown
    const shouldRenderMarkdown = markdown === true || (markdown !== false && looksLikeMarkdown(body));

    if (shouldRenderMarkdown) {
      // Create multipart/alternative with both plain and HTML
      mailOptions.text = body;
      mailOptions.html = await marked(body);
    } else {
      // Plain text only
      mailOptions.text = body;
    }
  }

  // Add threading headers
  if (inReplyTo) {
    mailOptions.inReplyTo = inReplyTo;
  }
  if (references && references.length > 0) {
    mailOptions.references = references.join(' ');
  }

  // Combine regular attachments with CID attachments
  const allAttachments: any[] = [];

  // Add regular attachments if provided
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      allAttachments.push({
        filename: att.filename,
        path: att.path,
        content: att.content,
        contentType: att.contentType,
      });
    }
  }

  // Add CID attachments for inline images
  if (cidAttachments && cidAttachments.length > 0) {
    for (const att of cidAttachments) {
      allAttachments.push({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        cid: att.cid,
      });
    }
  }

  if (allAttachments.length > 0) {
    mailOptions.attachments = allAttachments;
  }

  // Create MailComposer and build message
  const mail = new MailComposer(mailOptions);
  const message = await mail.compile().build();

  // Extract the Message-ID that was generated
  const messageStr = message.toString('utf-8');
  const messageIdMatch = messageStr.match(/Message-ID:\s*(<[^>]+>)/i);
  const messageId = messageIdMatch ? messageIdMatch[1] : `<${Date.now()}@${account.from.email.split('@')[1]}>`;

  return {
    message,
    messageId,
  };
}

/**
 * Create a draft email in the user's Drafts mailbox
 *
 * @param options - Draft creation options
 * @param account - Email account to use
 * @returns Result with success status, UID, and Message-ID
 */
export async function createDraft(
  options: CreateDraftOptions,
  account: EmailAccount
): Promise<DraftResult> {
  const config = createImapConfig(account);
  const client = new ImapClient(config);

  try {
    await client.connect();

    // Find the Drafts mailbox
    const draftsMailbox = await client.findDraftsMailbox();

    // Build the message
    const { message, messageId } = await buildMessage(options, account);

    // Append to Drafts with \Draft and \Seen flags
    const uid = await client.appendMessage(draftsMailbox, message, ['\\Draft', '\\Seen']);

    await client.disconnect();

    return {
      success: true,
      uid,
      messageId,
      account: account.name,
      mailbox: draftsMailbox,
    };
  } catch (error) {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    return {
      success: false,
      messageId: '',
      account: account.name,
      mailbox: 'Drafts',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
