/**
 * Email Draft Commands
 *
 * Commands for creating email drafts:
 * - draft create: Create a draft email in the user's Drafts mailbox
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { loadConfig, getAccount } from '../config';
import { createDraft } from '../draft/service';
import { ImapDraftsStore } from '../draft/imap-store';
import { lookupDraft, saveDraftOnce, validateRequestId, type DraftsStore } from '../draft/request';
import type { CreateDraftOptions, EmailAttachment } from '../types';

import { createLogger } from '../logger';
const logger = createLogger('email-draft');

/**
 * Create the draft command group
 */
export function createDraftCommand(): Command {
  const draft = new Command('draft')
    .description('Draft email commands');

  // draft create
  draft
    .command('create')
    .description('Create a draft email in the Drafts mailbox')
    .requiredOption('-t, --to <addresses>', 'Recipient email address(es), comma-separated')
    .requiredOption('-s, --subject <subject>', 'Email subject')
    .option('-b, --body <text>', 'Email body (plain text or markdown)')
    .option('-f, --file <path>', 'Read email body from file')
    .option('--cc <addresses>', 'CC email address(es), comma-separated')
    .option('--bcc <addresses>', 'BCC email address(es), comma-separated')
    .option('--attachment <paths...>', 'Attachment file path(s)')
    .option('-a, --account <name>', 'Email account to use (default: config default)')
    .option('--no-markdown', 'Disable markdown rendering (send as plain text)')
    .option('-o, --output <format>', 'Output format: text (default) or json', 'text')
    .option('--in-reply-to <messageId>', 'Message-ID to reply to (for threading)')
    .option('--request-id <id>', 'Save at most one draft per request ID (stamped as a header)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      try {
        // Load configuration
        const config = loadConfig();
        const account = getAccount(config, options.account);

        // Get email body
        let body: string;
        if (options.file) {
          body = readFileSync(options.file, 'utf-8');
        } else if (options.body) {
          body = options.body;
        } else {
          // Read from stdin
          const stdinBuffer = await Bun.stdin.text();
          if (!stdinBuffer.trim()) {
            logger.error('No email body provided');
            if (options.output === 'json') {
              console.log(JSON.stringify({ success: false, error: 'No email body provided' }));
            } else {
              console.error('❌ Error: No email body provided (use --body, --file, or stdin)');
            }
            process.exit(1);
          }
          body = stdinBuffer;
        }

        // Parse recipients
        const to = options.to.split(',').map((e: string) => e.trim());
        const cc = options.cc ? options.cc.split(',').map((e: string) => e.trim()) : undefined;
        const bcc = options.bcc ? options.bcc.split(',').map((e: string) => e.trim()) : undefined;

        // Parse attachments
        const attachments: EmailAttachment[] | undefined = options.attachment
          ? options.attachment.map((path: string) => ({
              filename: path.split('/').pop() || path,
              path: path,
            }))
          : undefined;

        // Build draft options
        const draftOptions: CreateDraftOptions = {
          to,
          cc,
          bcc,
          subject: options.subject,
          body,
          markdown: options.markdown,
          attachments,
          inReplyTo: options.inReplyTo,
        };

        if (options.requestId !== undefined) {
          const invalid = validateRequestId(options.requestId);
          if (invalid) throw new Error(invalid);
          logger.info('Saving draft by request ID', { account: account.name, requestId: options.requestId });
          const outcome = await saveDraftOnce(new ImapDraftsStore(account), options.requestId, draftOptions);
          logger.info('Draft request answered', outcome);
          if (options.output === 'json') {
            console.log(JSON.stringify(outcome));
          } else {
            console.log(`Draft ${outcome.status}`);
            console.log(`   Account: ${outcome.account}`);
            console.log(`   Message-ID: ${outcome.id}`);
          }
          return;
        }

        // Create the draft
        logger.info('Creating draft', { account: account.name, to, subject: options.subject });
        const result = await createDraft(draftOptions, account);

        if (result.success) {
          logger.info('Draft created successfully', {
            uid: result.uid,
            messageId: result.messageId,
            mailbox: result.mailbox,
          });

          if (options.output === 'json') {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`✅ Draft created successfully`);
            console.log(`   Account: ${result.account}`);
            console.log(`   Mailbox: ${result.mailbox}`);
            console.log(`   UID: ${result.uid}`);
            console.log(`   Message-ID: ${result.messageId}`);
          }
        } else {
          logger.error('Failed to create draft', { error: result.error });
          if (options.output === 'json') {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.error(`❌ Failed to create draft: ${result.error}`);
          }
          process.exit(1);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Draft creation error', { error: errorMsg });
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: false, error: errorMsg }));
        } else {
          console.error(`❌ Error: ${errorMsg}`);
        }
        process.exit(1);
      }
    });

  // draft lookup
  draft
    .command('lookup <requestId>')
    .description('Find a draft saved with --request-id: found, not_found or unavailable')
    .option('-a, --account <name>', 'Only look in this account (default: every IMAP account)')
    .option('-o, --output <format>', 'Output format: text (default) or json', 'text')
    .action(async (requestId: string, options) => {
      try {
        const invalid = validateRequestId(requestId);
        if (invalid) throw new Error(invalid);
        const config = loadConfig();
        const names = options.account
          ? [options.account]
          : Object.keys(config.accounts).filter((name) => config.accounts[name]?.imap?.enabled);
        const stores = names.map((name) => storeFor(config, name));
        const result = await lookupDraft(stores, requestId);
        logger.info('Draft lookup answered', { requestId, ...result });
        if (options.output === 'json') {
          console.log(JSON.stringify(result));
        } else if (result.status === 'found') {
          console.log(`Draft found in ${result.account}: ${result.id}`);
        } else {
          console.log(result.status === 'not_found' ? 'Draft not found' : 'Drafts unavailable');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Draft lookup error', { error: errorMsg });
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: false, error: errorMsg }));
        } else {
          console.error(`❌ Error: ${errorMsg}`);
        }
        process.exit(1);
      }
    });

  return draft;
}

/** An account's Drafts store; an account that cannot be resolved answers as unreachable. */
function storeFor(config: ReturnType<typeof loadConfig>, name: string): DraftsStore {
  try {
    return new ImapDraftsStore(getAccount(config, name));
  } catch (error) {
    return {
      account: name,
      findByRequestId: () => Promise.reject(error),
      save: () => Promise.reject(error),
    };
  }
}
