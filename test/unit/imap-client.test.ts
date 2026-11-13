/**
 * TDD Tests: IMAP Client Extension
 * T-1.2: appendMessage() method
 * T-1.3: findDraftsMailbox() method
 * Bug fix: deleteMessage() must call EXPUNGE
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { ImapClient } from '../../src/imap/client';
import type { ImapConfig } from '../../src/types';
import { MessageUID, UID_OPTIONS } from '../../src/imap/types';

// Mock config for testing
const mockConfig: ImapConfig = {
  host: 'imap.example.com',
  port: 993,
  tls: true,
  user: 'test@example.com',
  pass: 'password123',
};

describe('ImapClient.deleteMessage()', () => {
  it('should have deleteMessage method', () => {
    const client = new ImapClient(mockConfig);
    expect(typeof client.deleteMessage).toBe('function');
  });

  it('should have expungeDeleted method for committing deletions', () => {
    const client = new ImapClient(mockConfig);
    expect(typeof client.expungeDeleted).toBe('function');
  });
});

describe('ImapClient private UID helpers (T-2.1)', () => {
  describe('uidFlagsAdd()', () => {
    it('should exist as private method', () => {
      const client = new ImapClient(mockConfig);
      expect(typeof (client as any).uidFlagsAdd).toBe('function');
    });
  });

  describe('uidFlagsRemove()', () => {
    it('should exist as private method', () => {
      const client = new ImapClient(mockConfig);
      expect(typeof (client as any).uidFlagsRemove).toBe('function');
    });
  });

  describe('uidMove()', () => {
    it('should exist as private method', () => {
      const client = new ImapClient(mockConfig);
      expect(typeof (client as any).uidMove).toBe('function');
    });
  });

  describe('UID_OPTIONS usage', () => {
    it('should import UID_OPTIONS from types module', () => {
      expect(UID_OPTIONS).toBeDefined();
      expect(UID_OPTIONS.uid).toBe(true);
    });
  });
});

describe('ImapClient.appendMessage()', () => {
  it('should have appendMessage method', () => {
    const client = new ImapClient(mockConfig);
    expect(typeof client.appendMessage).toBe('function');
  });

  it('should accept mailbox, message buffer, and optional flags', async () => {
    const client = new ImapClient(mockConfig);

    // Test method signature exists
    const signature = client.appendMessage.length;
    expect(signature).toBeGreaterThanOrEqual(2); // At least mailbox and message
  });
});

describe('ImapClient.findDraftsMailbox()', () => {
  it('should have findDraftsMailbox method', () => {
    const client = new ImapClient(mockConfig);
    expect(typeof client.findDraftsMailbox).toBe('function');
  });
});

describe('Content-Transfer-Encoding decoding', () => {
  describe('decodeQuotedPrintable()', () => {
    it('should decode basic quoted-printable text', () => {
      const client = new ImapClient(mockConfig);
      // Access private method via any cast for testing
      const decode = (client as any).decodeQuotedPrintable.bind(client);

      const input = 'Hello=20World';
      const expected = 'Hello World';
      expect(decode(input)).toBe(expected);
    });

    it('should handle soft line breaks', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeQuotedPrintable.bind(client);

      const input = 'This is a long line that was soft=\nwrapped by the encoder';
      const expected = 'This is a long line that was softwrapped by the encoder';
      expect(decode(input)).toBe(expected);
    });

    it('should decode UTF-8 characters', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeQuotedPrintable.bind(client);

      // "über" in quoted-printable UTF-8
      const input = '=C3=BCber';
      const expected = 'über';
      expect(decode(input)).toBe(expected);
    });

    it('should handle mixed ASCII and encoded characters', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeQuotedPrintable.bind(client);

      const input = 'Gr=C3=BCsse from Z=C3=BCrich';
      const expected = 'Grüsse from Zürich';
      expect(decode(input)).toBe(expected);
    });
  });

  describe('decodeBase64()', () => {
    it('should decode basic base64 text', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeBase64.bind(client);

      const input = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const expected = 'Hello World';
      expect(decode(input)).toBe(expected);
    });

    it('should handle base64 with line breaks', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeBase64.bind(client);

      // "Hello World" split across lines
      const input = 'SGVsbG8g\nV29ybGQ=';
      const expected = 'Hello World';
      expect(decode(input)).toBe(expected);
    });

    it('should decode UTF-8 content from base64', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeBase64.bind(client);

      // "Grüsse aus Zürich" in base64
      const input = 'R3LDvHNzZSBhdXMgWsO8cmljaA==';
      const expected = 'Grüsse aus Zürich';
      expect(decode(input)).toBe(expected);
    });

    it('should return empty string for invalid base64', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeBase64.bind(client);

      const input = 'not valid base64!!!';
      expect(decode(input)).toBe('');
    });
  });

  describe('decodeEmailBody()', () => {
    it('should decode quoted-printable content', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeEmailBody.bind(client);

      const source = `Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Gr=C3=BCsse aus Z=C3=BCrich`;

      const result = decode(source);
      expect(result).toContain('Grüsse aus Zürich');
    });

    it('should decode base64 content', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeEmailBody.bind(client);

      const source = `Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64

SGVsbG8gV29ybGQ=`;

      const result = decode(source);
      expect(result).toContain('Hello World');
    });

    it('should return plain text without encoding', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeEmailBody.bind(client);

      const source = `Content-Type: text/plain

Hello World`;

      const result = decode(source);
      expect(result).toContain('Hello World');
    });

    it('should decode base64 content inside multipart MIME', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeEmailBody.bind(client);

      // Simulates multipart email with base64-encoded HTML part
      const source = `Content-Type: multipart/alternative;
 boundary="_005_TEST123"

--_005_TEST123
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: base64

PGh0bWw+PGJvZHk+SGVsbG8gV29ybGQ8L2JvZHk+PC9odG1sPg==
--_005_TEST123--`;
      // Base64 decodes to: <html><body>Hello World</body></html>

      const result = decode(source);
      expect(result).toContain('Hello World');
    });

    it('should prefer text/plain over text/html in multipart', () => {
      const client = new ImapClient(mockConfig);
      const decode = (client as any).decodeEmailBody.bind(client);

      const source = `Content-Type: multipart/alternative;
 boundary="_boundary_"

--_boundary_
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: base64

UGxhaW4gdGV4dCBjb250ZW50
--_boundary_
Content-Type: text/html; charset="utf-8"
Content-Transfer-Encoding: base64

PGh0bWw+SFRNTCBjb250ZW50PC9odG1sPg==
--_boundary_--`;
      // text/plain decodes to: "Plain text content"
      // text/html decodes to: "<html>HTML content</html>"

      const result = decode(source);
      expect(result).toContain('Plain text content');
    });
  });
});
