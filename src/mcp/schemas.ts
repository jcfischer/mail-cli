/**
 * MCP Tool Schemas
 *
 * Zod schemas for all Email MCP tools with descriptions for AI documentation.
 */

import { z } from 'zod';

// Common schemas
// Note: nullable() is needed because some LLMs send null instead of omitting optional fields
export const accountSchema = z
  .string()
  .min(1)
  .describe('Email account name (e.g., "personal", "work")');

export const limitSchema = z
  .number()
  .min(1)
  .max(1000)
  .default(20)
  .describe('Maximum number of results to return');

// email_search - Full-text search
export const searchSchema = z.object({
  query: z.string().min(1).describe('Full-text search query (searches subject, sender, snippet)'),
  account: accountSchema,
  limit: limitSchema,
  mailbox: z
    .string()
    .optional()
    .describe('Filter by mailbox (e.g., "INBOX", "Archive", "Sent")'),
  unread: z
    .boolean()
    .default(false)
    .describe('Only return unread emails'),
  from: z
    .string()
    .optional()
    .describe('Filter by sender email address (partial match, e.g., "alice@company.com" or just "company.com")'),
  to: z
    .string()
    .optional()
    .describe('Filter by recipient email address (partial match)'),
});
export type SearchInput = z.infer<typeof searchSchema>;

// email_semantic_search - AI-powered natural language search
export const semanticSearchSchema = z.object({
  query: z.string().min(1).describe('Natural language search query for semantic similarity matching'),
  account: accountSchema,
  limit: limitSchema,
  from: z
    .string()
    .optional()
    .describe('Filter by sender email address (partial match, e.g., "alice@company.com" or just "company.com")'),
  to: z
    .string()
    .optional()
    .describe('Filter by recipient email address (partial match)'),
});
export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

// email_list - List emails from mailbox
export const listSchema = z.object({
  account: accountSchema,
  mailbox: z
    .string()
    .default('INBOX')
    .describe('Mailbox to list emails from (default: INBOX)'),
  limit: limitSchema,
  unseen: z
    .boolean()
    .default(false)
    .describe('Only return unread emails'),
  since: z
    .number()
    .optional()
    .describe('Filter emails from last N days'),
});
export type ListInput = z.infer<typeof listSchema>;

// email_get - Get full email by Message-ID
export const getSchema = z.object({
  messageId: z.string().min(1).describe('Message-ID to fetch (e.g., "<abc123@mail.example.com>")'),
  account: z
    .string()
    .optional()
    .describe('Account to search in (searches all accounts if not specified)'),
  html: z
    .boolean()
    .default(false)
    .describe('Return HTML body instead of plain text'),
});
export type GetInput = z.infer<typeof getSchema>;

// email_send - Send email via SMTP
export const sendSchema = z.object({
  to: z
    .union([z.string(), z.array(z.string())])
    .describe('Recipient email address(es)'),
  subject: z.string().min(1).describe('Email subject'),
  body: z.string().min(1).describe('Email body (markdown supported)'),
  account: z
    .string()
    .optional()
    .describe('Account to send from (uses default if not specified)'),
  cc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('CC recipient(s)'),
  bcc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('BCC recipient(s)'),
  markdown: z
    .boolean()
    .default(true)
    .describe('Render body as markdown (default: true)'),
});
export type SendInput = z.infer<typeof sendSchema>;

// email_draft_create - Create draft email in Drafts mailbox
export const draftCreateSchema = z.object({
  to: z
    .union([z.string(), z.array(z.string())])
    .describe('Recipient email address(es)'),
  subject: z.string().min(1).describe('Email subject'),
  body: z.string().min(1).describe('Email body (markdown supported by default)'),
  account: z
    .string()
    .optional()
    .describe('Account to create draft in (uses default if not specified)'),
  cc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('CC recipient(s)'),
  bcc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('BCC recipient(s)'),
  markdown: z
    .boolean()
    .default(true)
    .describe('Render body as markdown (default: true)'),
  inReplyTo: z
    .string()
    .optional()
    .describe('Message-ID to reply to (for email threading)'),
  references: z
    .array(z.string())
    .optional()
    .describe('Thread reference Message-IDs'),
});
export type DraftCreateInput = z.infer<typeof draftCreateSchema>;

// email_stats - Email analytics and statistics
export const statsSchema = z.object({
  account: accountSchema,
  period: z
    .enum(['day', 'week', 'month'])
    .default('week')
    .describe('Time period for statistics'),
});
export type StatsInput = z.infer<typeof statsSchema>;

/**
 * Convert Zod schema to JSON Schema for MCP tool registration
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodTypeToJsonSchema(zodValue);

      // Check if required (not optional and not has default)
      if (!isOptional(zodValue)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object' };
}

function zodTypeToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
  const description = zodType.description;
  const base: Record<string, unknown> = {};

  if (description) {
    base.description = description;
  }

  // Unwrap optional/default
  let innerType = zodType;
  if (innerType instanceof z.ZodOptional) {
    innerType = innerType.unwrap();
  }
  if (innerType instanceof z.ZodDefault) {
    const def = innerType._def as { defaultValue?: unknown; innerType?: z.ZodType };
    if (typeof def.defaultValue === 'function') {
      base.default = def.defaultValue();
    } else if (def.defaultValue !== undefined) {
      base.default = def.defaultValue;
    }
    if (def.innerType) {
      innerType = def.innerType;
    }
  }

  if (innerType instanceof z.ZodString) {
    return { ...base, type: 'string' };
  }
  if (innerType instanceof z.ZodNumber) {
    return { ...base, type: 'number' };
  }
  if (innerType instanceof z.ZodBoolean) {
    return { ...base, type: 'boolean' };
  }
  if (innerType instanceof z.ZodEnum) {
    return { ...base, type: 'string', enum: innerType._def.values };
  }
  if (innerType instanceof z.ZodArray) {
    return { ...base, type: 'array', items: zodTypeToJsonSchema(innerType.element) };
  }
  if (innerType instanceof z.ZodUnion) {
    return { ...base, oneOf: innerType._def.options.map(zodTypeToJsonSchema) };
  }

  return { ...base, type: 'string' };
}

function isOptional(zodType: z.ZodType): boolean {
  if (zodType instanceof z.ZodOptional) return true;
  if (zodType instanceof z.ZodDefault) return true;
  if (zodType instanceof z.ZodNullable) return true;
  // Handle Zod v4 pipe (used by .transform())
  const def = zodType._def as { type?: string; in?: z.ZodType; schema?: z.ZodType };
  if (def.type === 'pipe' && def.in) {
    return isOptional(def.in);
  }
  // Handle transform (ZodEffects in Zod v3)
  if (def.schema) {
    return isOptional(def.schema);
  }
  return false;
}
