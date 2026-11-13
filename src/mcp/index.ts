#!/usr/bin/env bun
/**
 * Email MCP Server
 *
 * Model Context Protocol server for Email integration.
 * Enables AI tools (ChatGPT, Cursor, Claude, etc.) to manage emails.
 *
 * IMPORTANT: MCP uses stdio for JSON-RPC communication.
 * All logging MUST go to stderr, never stdout.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as schemas from './schemas.js';
import { search, semanticSearch } from './tools/search.js';
import { list, get } from './tools/list.js';
import { send } from './tools/send.js';
import { stats } from './tools/stats.js';
import { draftCreate } from './tools/draft.js';
import { VERSION } from '../version.js';

const SERVICE_NAME = process.env.SERVICE_NAME || 'email-mcp';

/**
 * MCP-safe logger - writes to stderr to avoid interfering with stdio JSON-RPC
 */
const logger = {
  info: (...args: unknown[]) => console.error(`[${SERVICE_NAME}]`, ...args),
  warn: (...args: unknown[]) => console.error(`[${SERVICE_NAME}] WARN:`, ...args),
  error: (...args: unknown[]) => console.error(`[${SERVICE_NAME}] ERROR:`, ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) console.error(`[${SERVICE_NAME}] DEBUG:`, ...args);
  },
};

const server = new Server(
  {
    name: 'email-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info('Listing available tools');

  return {
    tools: [
      {
        name: 'email_search',
        description:
          'Full-text search across indexed emails. Searches subject, sender, and snippet using FTS5. Returns email metadata including Message-ID for fetching full content.',
        inputSchema: schemas.zodToJsonSchema(schemas.searchSchema),
      },
      {
        name: 'email_semantic_search',
        description:
          'AI-powered natural language search using vector embeddings. Finds conceptually similar emails even without exact keyword matches. Requires embeddings to be generated first (email embed generate).',
        inputSchema: schemas.zodToJsonSchema(schemas.semanticSearchSchema),
      },
      {
        name: 'email_list',
        description:
          'List emails from a mailbox with optional filters. Returns email metadata sorted by date (newest first).',
        inputSchema: schemas.zodToJsonSchema(schemas.listSchema),
      },
      {
        name: 'email_get',
        description:
          'Get full email content by Message-ID. Fetches the complete email body from IMAP. Use the Message-ID from search or list results.',
        inputSchema: schemas.zodToJsonSchema(schemas.getSchema),
      },
      {
        name: 'email_send',
        description:
          'Send an email via SMTP. Supports markdown rendering, CC/BCC, and multiple recipients. Uses configured SMTP accounts.',
        inputSchema: schemas.zodToJsonSchema(schemas.sendSchema),
      },
      {
        name: 'email_stats',
        description:
          'Get email analytics and statistics for a period. Includes volume trends, top senders, priority distribution, and read rates.',
        inputSchema: schemas.zodToJsonSchema(schemas.statsSchema),
      },
      {
        name: 'email_draft_create',
        description:
          'Create a draft email in the Drafts mailbox for user review before sending. Supports markdown rendering, CC/BCC, threading via In-Reply-To, and multiple recipients. The draft appears in the email client (Apple Mail, etc.) for the user to review, edit, and send manually.',
        inputSchema: schemas.zodToJsonSchema(schemas.draftCreateSchema),
      },
    ],
  };
});

// Execute tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info('Tool called', { tool: name });

  try {
    let result: unknown;

    switch (name) {
      case 'email_search': {
        const validated = schemas.searchSchema.parse(args);
        result = await search(validated);
        break;
      }
      case 'email_semantic_search': {
        const validated = schemas.semanticSearchSchema.parse(args);
        result = await semanticSearch(validated);
        break;
      }
      case 'email_list': {
        const validated = schemas.listSchema.parse(args);
        result = await list(validated);
        break;
      }
      case 'email_get': {
        const validated = schemas.getSchema.parse(args);
        result = await get(validated);
        if (result === null) {
          result = { error: 'Email not found', messageId: validated.messageId };
        }
        break;
      }
      case 'email_send': {
        const validated = schemas.sendSchema.parse(args);
        result = await send(validated);
        break;
      }
      case 'email_stats': {
        const validated = schemas.statsSchema.parse(args);
        result = await stats(validated);
        break;
      }
      case 'email_draft_create': {
        const validated = schemas.draftCreateSchema.parse(args);
        result = await draftCreate(validated);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    logger.info('Tool executed successfully', { tool: name });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Tool execution failed', { tool: name, error: message });
    throw error;
  }
});

async function main() {
  logger.info('Starting Email MCP server', {
    version: VERSION,
    serviceName: SERVICE_NAME,
  });

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Email MCP server running');
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
