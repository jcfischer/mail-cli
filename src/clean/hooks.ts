/**
 * Hook Link Generator
 * Generate hook://email/ URLs for Tana integration
 */

/**
 * Generate a hook:// URL for an email message
 * Format: hook://email/<URL-encoded-messageId>
 *
 * @param messageId - Email Message-ID (with or without angle brackets)
 * @returns hook://email/ URL
 */
export function generateEmailHookLink(messageId: string): string {
  // Strip angle brackets if present
  const cleanId = messageId.replace(/^<|>$/g, '');

  // URL-encode the message ID
  const encodedId = encodeURIComponent(cleanId);

  return `hook://email/${encodedId}`;
}
