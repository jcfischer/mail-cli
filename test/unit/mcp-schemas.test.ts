/**
 * TDD Tests: MCP Schemas
 * T-4.1: draftCreateSchema for email_draft_create MCP tool
 */

import { describe, it, expect } from 'bun:test';
import { draftCreateSchema, zodToJsonSchema } from '../../src/mcp/schemas';

describe('draftCreateSchema', () => {
  it('should validate valid draft creation input', () => {
    const input = {
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: 'Test body content',
      account: 'personal',
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept string for to field (converted to array)', () => {
    const input = {
      to: 'test@example.com',
      subject: 'Test Subject',
      body: 'Test body content',
      account: 'personal',
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept optional cc and bcc fields', () => {
    const input = {
      to: ['primary@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
      subject: 'Test Subject',
      body: 'Test body',
      account: 'personal',
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept optional markdown field', () => {
    const input = {
      to: ['test@example.com'],
      subject: 'Test Subject',
      body: '# Heading',
      markdown: true,
      account: 'personal',
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept optional inReplyTo field', () => {
    const input = {
      to: ['test@example.com'],
      subject: 'Re: Original',
      body: 'Reply content',
      inReplyTo: '<original@example.com>',
      account: 'personal',
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const input = {
      to: ['test@example.com'],
      // missing subject and body
    };

    const result = draftCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should generate valid JSON schema', () => {
    const jsonSchema = zodToJsonSchema(draftCreateSchema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();

    const props = jsonSchema.properties as Record<string, any>;
    expect(props.to).toBeDefined();
    expect(props.subject).toBeDefined();
    expect(props.body).toBeDefined();
    expect(props.account).toBeDefined();
    expect(props.cc).toBeDefined();
    expect(props.bcc).toBeDefined();
    expect(props.markdown).toBeDefined();
    expect(props.inReplyTo).toBeDefined();
  });
});
