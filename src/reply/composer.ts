/**
 * Reply Composer
 * Assembles email replies with signature and quoted original content
 */

import { readFile, access } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { homedir } from 'os';
import type {
  SignatureConfig,
  LoadedSignature,
  EmbeddedImage,
  ComposeReplyOptions,
  QuotedContent,
  ComposedReply,
} from './types';

/**
 * Format quote header line
 * Returns: "On 19 Dec 2025, at 07:32, sender wrote:"
 */
export function formatQuoteHeader(from: string, date: Date): string {
  // Format date: "19 Dec 2025"
  const day = date.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const formattedDate = `${day} ${month} ${year}`;

  // Format time: "07:32"
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  // Extract sender name or use email
  let sender = from;
  const nameMatch = from.match(/^([^<]+)\s*</);
  if (nameMatch) {
    sender = nameMatch[1].trim();
  }

  return `On ${formattedDate}, at ${formattedTime}, ${sender} wrote:`;
}

/**
 * Quote original email body
 * - Plain text: prefix each line with ">"
 * - HTML: wrap in <blockquote>
 */
export function formatQuotedContent(
  body: string,
  htmlBody: string | undefined,
  maxLength: number
): QuotedContent {
  if (!body && !htmlBody) {
    return { plainText: '', html: '', truncated: false };
  }

  let truncated = false;
  let effectiveBody = body;
  let effectiveHtml = htmlBody || body;

  // Check if truncation is needed
  if (body.length > maxLength) {
    truncated = true;
    effectiveBody = body.substring(0, maxLength) + '\n\n[... truncated]';
  }

  if (htmlBody && htmlBody.length > maxLength) {
    truncated = true;
    effectiveHtml = htmlBody.substring(0, maxLength) + '<p><em>[... truncated]</em></p>';
  }

  // Format plain text with > prefix
  const plainTextLines = effectiveBody.split('\n');
  const quotedPlainText = plainTextLines.map(line => `> ${line}`.trimEnd()).join('\n');

  // Format HTML with blockquote
  const blockquoteStyle = 'margin: 0 0 0 0.8ex; border-left: 2px solid #ccc; padding-left: 1ex;';
  const quotedHtml = `<blockquote style="${blockquoteStyle}">${effectiveHtml}</blockquote>`;

  return {
    plainText: body ? quotedPlainText : '',
    html: (htmlBody || body) ? quotedHtml : '',
    truncated,
  };
}

/**
 * Load signature from file system
 */
export async function loadSignature(
  accountName: string,
  config: SignatureConfig | undefined
): Promise<LoadedSignature | null> {
  // Check if disabled
  if (config?.enabled === false) {
    return null;
  }

  // Determine signature path
  const defaultPath = join(homedir(), '.config', 'email', 'signatures', `${accountName}.html`);
  const sigPath = config?.path || defaultPath;

  // Try to read signature file
  try {
    await access(sigPath);
    const html = await readFile(sigPath, 'utf-8');

    // Load text fallback if specified
    let text: string | undefined;
    if (config?.textPath) {
      try {
        text = await readFile(config.textPath, 'utf-8');
      } catch {
        // Text fallback is optional
      }
    }

    return {
      html,
      text,
      attachments: [],
    };
  } catch {
    // Signature file doesn't exist
    return null;
  }
}

/**
 * Embed images from file:// URLs in signature HTML
 * Converts to CID references for nodemailer
 */
export async function embedSignatureImages(
  html: string,
  basePath: string
): Promise<{ html: string; attachments: EmbeddedImage[] }> {
  const attachments: EmbeddedImage[] = [];
  let processedHtml = html;

  // Find all file:// URLs in img src attributes
  const fileUrlRegex = /src=["']file:\/\/([^"']+)["']/g;
  const matches = [...html.matchAll(fileUrlRegex)];

  for (const match of matches) {
    const filePath = match[1];

    try {
      // Check if file exists
      await access(filePath);
      const content = await readFile(filePath);

      // Determine content type from extension
      const ext = extname(filePath).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Generate unique CID
      const filename = filePath.split('/').pop() || 'image';
      const cid = `${filename.replace(/\.[^.]+$/, '')}-${Date.now()}-${attachments.length}`;

      attachments.push({
        cid,
        filename,
        content,
        contentType,
      });

      // Replace file:// URL with cid: reference
      processedHtml = processedHtml.replace(match[0], `src="cid:${cid}"`);
    } catch {
      // File not found - leave reference unchanged
    }
  }

  return { html: processedHtml, attachments };
}

/**
 * Compose complete reply with all components
 * Structure: [reply text] + [--] + [signature] + [quote header] + [quoted original]
 */
export async function composeReply(options: ComposeReplyOptions): Promise<ComposedReply> {
  const { replyText, originalEmail, signature, maxQuoteLength = 102400 } = options;

  // Build plain text version
  const plainTextParts: string[] = [replyText];
  const htmlParts: string[] = [`<div>${replyText.replace(/\n/g, '<br>')}</div>`];

  // Add signature if present
  if (signature) {
    plainTextParts.push('--');
    plainTextParts.push(signature.text || stripHtml(signature.html));

    htmlParts.push('<div>--</div>');
    htmlParts.push(`<div>${signature.html}</div>`);
  }

  // Add quote header
  const quoteHeader = formatQuoteHeader(originalEmail.from, originalEmail.date);
  plainTextParts.push('');
  plainTextParts.push(quoteHeader);
  htmlParts.push('<br>');
  htmlParts.push(`<div>${quoteHeader}</div>`);

  // Add quoted content
  const quoted = formatQuotedContent(
    originalEmail.body,
    originalEmail.htmlBody,
    maxQuoteLength
  );

  if (quoted.plainText) {
    plainTextParts.push('');
    plainTextParts.push(quoted.plainText);
  }

  if (quoted.html) {
    htmlParts.push(quoted.html);
  }

  // Collect attachments from signature
  const attachments = signature?.attachments || [];

  return {
    plainText: plainTextParts.join('\n'),
    html: htmlParts.join('\n'),
    attachments,
  };
}

/**
 * Strip HTML tags for plain text fallback
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
