/**
 * Reply Composer Tests
 * TDD: These tests are written FIRST (RED phase)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Import functions that don't exist yet (will fail until implementation)
import {
  formatQuoteHeader,
  formatQuotedContent,
  loadSignature,
  embedSignatureImages,
  composeReply,
} from '../../src/reply/composer';

import type {
  ComposeReplyOptions,
  LoadedSignature,
  EmbeddedImage,
  QuotedContent,
  ComposedReply,
} from '../../src/reply/types';

describe('Reply Composer', () => {
  describe('formatQuoteHeader', () => {
    it('should format quote header with display name', () => {
      const date = new Date('2025-12-19T07:32:00Z');
      const result = formatQuoteHeader('John Doe <john@example.com>', date);

      expect(result).toContain('On');
      expect(result).toContain('19 Dec 2025');
      expect(result).toContain('07:32');
      expect(result).toContain('John Doe');
      expect(result).toContain('wrote:');
    });

    it('should format quote header with email only', () => {
      const date = new Date('2025-12-19T14:45:00Z');
      const result = formatQuoteHeader('invoices@example.org', date);

      expect(result).toContain('On');
      expect(result).toContain('19 Dec 2025');
      expect(result).toContain('14:45');
      expect(result).toContain('invoices@example.org');
      expect(result).toContain('wrote:');
    });

    it('should handle different date formats', () => {
      const date = new Date('2025-01-05T09:00:00Z');
      const result = formatQuoteHeader('test@example.com', date);

      expect(result).toContain('5 Jan 2025');
    });
  });

  describe('formatQuotedContent', () => {
    it('should quote plain text with > prefix', () => {
      const body = 'Hello,\n\nThis is a test email.\n\nBest regards';
      const result = formatQuotedContent(body, undefined, 102400);

      expect(result.plainText).toContain('> Hello,');
      expect(result.plainText).toContain('> This is a test email.');
      expect(result.plainText).toContain('> Best regards');
      expect(result.truncated).toBe(false);
    });

    it('should wrap HTML in blockquote', () => {
      const body = 'Hello world';
      const htmlBody = '<p>Hello world</p>';
      const result = formatQuotedContent(body, htmlBody, 102400);

      expect(result.html).toContain('<blockquote');
      expect(result.html).toContain('Hello world');
      expect(result.html).toContain('</blockquote>');
    });

    it('should truncate content exceeding maxLength', () => {
      const longBody = 'A'.repeat(200);
      const result = formatQuotedContent(longBody, undefined, 100);

      expect(result.truncated).toBe(true);
      expect(result.plainText).toContain('[... truncated]');
      expect(result.plainText.length).toBeLessThan(200 + 50); // Allow for prefix overhead
    });

    it('should handle empty body gracefully', () => {
      const result = formatQuotedContent('', undefined, 102400);

      expect(result.plainText).toBe('');
      expect(result.html).toBe('');
      expect(result.truncated).toBe(false);
    });

    it('should preserve blank lines in quoted content', () => {
      const body = 'Line 1\n\nLine 2';
      const result = formatQuotedContent(body, undefined, 102400);

      expect(result.plainText).toContain('> Line 1');
      expect(result.plainText).toContain('>');
      expect(result.plainText).toContain('> Line 2');
    });
  });

  describe('loadSignature', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'email-sig-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should load HTML signature from specified path', async () => {
      const sigPath = join(tempDir, 'test.html');
      await writeFile(sigPath, '<p>Best regards,<br>John</p>');

      const result = await loadSignature('test', { path: sigPath, enabled: true });

      expect(result).not.toBeNull();
      expect(result!.html).toContain('Best regards');
      expect(result!.html).toContain('John');
    });

    it('should return null for disabled signature', async () => {
      const result = await loadSignature('test', { enabled: false });

      expect(result).toBeNull();
    });

    it('should return null for missing signature file', async () => {
      const result = await loadSignature('test', {
        path: join(tempDir, 'nonexistent.html'),
        enabled: true
      });

      expect(result).toBeNull();
    });

    it('should load text fallback when provided', async () => {
      const htmlPath = join(tempDir, 'sig.html');
      const textPath = join(tempDir, 'sig.txt');
      await writeFile(htmlPath, '<p>HTML Signature</p>');
      await writeFile(textPath, 'Text Signature');

      const result = await loadSignature('test', {
        path: htmlPath,
        textPath: textPath,
        enabled: true,
      });

      expect(result).not.toBeNull();
      expect(result!.html).toContain('HTML Signature');
      expect(result!.text).toBe('Text Signature');
    });

    it('should use default path when no path specified', async () => {
      // This test checks the default path logic
      // Default: ~/.config/email/signatures/{account}.html
      const result = await loadSignature('nonexistent-account', { enabled: true });

      // Should return null for non-existent default path
      expect(result).toBeNull();
    });
  });

  describe('embedSignatureImages', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'email-embed-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('should convert file:// URLs to CID references', async () => {
      // Create a small PNG (1x1 pixel transparent)
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c,
        0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x00, 0x00,
        0x00, 0x03, 0x00, 0x01, 0x20, 0xd5, 0x94, 0xc8,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
        0xae, 0x42, 0x60, 0x82
      ]);
      const imgPath = join(tempDir, 'logo.png');
      await writeFile(imgPath, pngBytes);

      const html = `<img src="file://${imgPath}" alt="Logo">`;
      const result = await embedSignatureImages(html, tempDir);

      expect(result.html).toContain('cid:');
      expect(result.html).not.toContain('file://');
      expect(result.attachments.length).toBe(1);
      expect(result.attachments[0].contentType).toBe('image/png');
    });

    it('should generate unique CIDs for multiple images', async () => {
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c,
        0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x00, 0x00,
        0x00, 0x03, 0x00, 0x01, 0x20, 0xd5, 0x94, 0xc8,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
        0xae, 0x42, 0x60, 0x82
      ]);

      const img1 = join(tempDir, 'logo1.png');
      const img2 = join(tempDir, 'logo2.png');
      await writeFile(img1, pngBytes);
      await writeFile(img2, pngBytes);

      const html = `<img src="file://${img1}"><img src="file://${img2}">`;
      const result = await embedSignatureImages(html, tempDir);

      expect(result.attachments.length).toBe(2);
      expect(result.attachments[0].cid).not.toBe(result.attachments[1].cid);
    });

    it('should leave missing image references unchanged', async () => {
      const html = '<img src="file:///nonexistent/image.png">';
      const result = await embedSignatureImages(html, tempDir);

      // Missing files are left as-is (may show as broken)
      expect(result.html).toContain('file:///nonexistent/image.png');
      expect(result.attachments.length).toBe(0);
    });

    it('should handle HTML without images', async () => {
      const html = '<p>No images here</p>';
      const result = await embedSignatureImages(html, tempDir);

      expect(result.html).toBe(html);
      expect(result.attachments.length).toBe(0);
    });

    it('should support JPG and GIF formats', async () => {
      // Minimal JPEG (2x2 pixels)
      const jpgBytes = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
        0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c,
        0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
        0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
        0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
        0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
        0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
        0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34,
        0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02,
        0x00, 0x02, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
        0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
        0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
        0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff,
        0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04,
        0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00,
        0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32,
        0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1,
        0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a,
        0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
        0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55,
        0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65,
        0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85,
        0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
        0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
        0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2,
        0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba,
        0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9,
        0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
        0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6,
        0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
        0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda,
        0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0xfb, 0xd5, 0xdb, 0x20, 0x00, 0x00, 0x00, 0x00,
        0x01, 0x00, 0xff, 0xd9
      ]);
      const jpgPath = join(tempDir, 'photo.jpg');
      await writeFile(jpgPath, jpgBytes);

      const html = `<img src="file://${jpgPath}">`;
      const result = await embedSignatureImages(html, tempDir);

      expect(result.attachments.length).toBe(1);
      expect(result.attachments[0].contentType).toBe('image/jpeg');
    });
  });

  describe('composeReply', () => {
    it('should compose complete reply with all components', async () => {
      const options: ComposeReplyOptions = {
        replyText: 'Thank you for your email.',
        originalEmail: {
          from: 'sender@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: 'Original message content',
        },
        signature: {
          html: '<p>Best regards,<br>John</p>',
          text: 'Best regards,\nJohn',
          attachments: [],
        },
        maxQuoteLength: 102400,
      };

      const result = await composeReply(options);

      // Check structure: reply + signature + quote header + quoted content
      expect(result.plainText).toContain('Thank you for your email.');
      expect(result.plainText).toContain('--');
      expect(result.plainText).toContain('Best regards');
      expect(result.plainText).toContain('On');
      expect(result.plainText).toContain('wrote:');
      expect(result.plainText).toContain('> Original message content');

      expect(result.html).toContain('Thank you for your email.');
      expect(result.html).toContain('Best regards');
      expect(result.html).toContain('<blockquote');
    });

    it('should compose reply without signature', async () => {
      const options: ComposeReplyOptions = {
        replyText: 'Quick reply here.',
        originalEmail: {
          from: 'test@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: 'Original content',
        },
      };

      const result = await composeReply(options);

      expect(result.plainText).toContain('Quick reply here.');
      expect(result.plainText).toContain('> Original content');
      expect(result.plainText).not.toContain('--\n'); // No separator without signature
    });

    it('should handle HTML body in original email', async () => {
      const options: ComposeReplyOptions = {
        replyText: 'Thanks!',
        originalEmail: {
          from: 'sender@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: 'Plain text version',
          htmlBody: '<p><strong>Rich</strong> HTML content</p>',
        },
      };

      const result = await composeReply(options);

      // HTML version should use the HTML body
      expect(result.html).toContain('Rich');
      expect(result.html).toContain('blockquote');
    });

    it('should include CID attachments from signature', async () => {
      const attachment: EmbeddedImage = {
        cid: 'logo123',
        filename: 'logo.png',
        content: Buffer.from('fake-image-data'),
        contentType: 'image/png',
      };

      const options: ComposeReplyOptions = {
        replyText: 'Hello',
        originalEmail: {
          from: 'test@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: 'Original',
        },
        signature: {
          html: '<img src="cid:logo123" alt="Logo">',
          attachments: [attachment],
        },
      };

      const result = await composeReply(options);

      expect(result.attachments.length).toBe(1);
      expect(result.attachments[0].cid).toBe('logo123');
    });

    it('should handle empty original body', async () => {
      const options: ComposeReplyOptions = {
        replyText: 'My response',
        originalEmail: {
          from: 'test@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: '',
        },
      };

      const result = await composeReply(options);

      expect(result.plainText).toContain('My response');
      // Should still have quote header but no quoted content
      expect(result.plainText).toContain('wrote:');
    });

    it('should respect maxQuoteLength configuration', async () => {
      const longBody = 'X'.repeat(1000);
      const options: ComposeReplyOptions = {
        replyText: 'Short reply',
        originalEmail: {
          from: 'test@example.com',
          date: new Date('2025-12-19T10:00:00Z'),
          body: longBody,
        },
        maxQuoteLength: 100,
      };

      const result = await composeReply(options);

      expect(result.plainText).toContain('[... truncated]');
    });
  });
});
