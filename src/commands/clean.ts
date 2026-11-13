/**
 * Clean Inbox Command
 * Interactive email processing workflow
 */

import { Command } from 'commander';
import { loadConfig, getAccount } from '../config';
import { createImapConfig, ImapClient } from '../imap/client';
import { createSession } from '../clean/session';
import { convertToCleanInboxEmail } from '../clean/fetch';
import { runTui, createDefaultHandlers, type TuiHandlers } from '../clean/tui';
import { homedir } from 'os';
import { join } from 'path';

import { createLogger } from '../logger';
const logger = createLogger('email-clean');

/**
 * Create the clean command with all subcommands
 */
export function createCleanCommand(): Command {
  const clean = new Command('clean')
    .description('Interactive clean inbox workflow');

  /**
   * Clean Start Command
   * Start an interactive clean inbox session
   */
  clean
    .command('start')
    .description('Start interactive clean inbox session')
    .requiredOption('-a, --account <name>', 'Account to process')
    .option('-l, --limit <number>', 'Max emails to process (default: 50)', '50')
    .option('-m, --mailbox <name>', 'Mailbox to process (default: INBOX)', 'INBOX')
    .option('-u, --unread-only', 'Only show unread emails')
    .option('--quick', 'Quick mode - disable AI features (reply, todo)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      try {
        const config = loadConfig();
        const account = getAccount(config, options.account);

        logger.info(`Starting clean inbox session for account: ${account.name}`);
        console.log(`\n📧 Clean Inbox - ${account.name}`);
        console.log(`📂 Mailbox: ${options.mailbox}`);
        console.log(`📊 Limit: ${options.limit} emails\n`);

        // Connect to IMAP
        const imapConfig = createImapConfig(account);
        const client = new ImapClient(imapConfig);

        console.log('Connecting to IMAP...');
        await client.connect();

        // Fetch emails
        console.log('Fetching emails...');
        const fetchOptions: any = {
          mailbox: options.mailbox,
          limit: parseInt(options.limit),
        };

        if (options.unreadOnly) {
          fetchOptions.unseen = true;
        }

        const messages = await client.fetchMessages(fetchOptions);

        if (messages.length === 0) {
          console.log('\n📭 No emails to process!');
          await client.disconnect();
          return;
        }

        // Convert to CleanInboxEmail format (include body for AI reply feature)
        const cleanEmails = messages.map(msg => convertToCleanInboxEmail(msg, { includeBody: true }));

        logger.info(`Fetched ${cleanEmails.length} emails for processing`);

        // Create session
        const session = createSession(
          {
            account: options.account,
            limit: parseInt(options.limit),
            quick: options.quick,
            verbose: options.verbose,
          },
          cleanEmails
        );

        // Create handlers
        const handlers: TuiHandlers = createDefaultHandlers(options.account);

        // Run TUI
        await runTui(session, client, handlers, {
          quick: options.quick,
          verbose: options.verbose,
        });

        // Expunge deleted messages (IMAP requires EXPUNGE to permanently remove)
        if (session.stats.deleted > 0) {
          console.log(`\n🗑️  Expunging ${session.stats.deleted} deleted message(s)...`);
          await client.expungeDeleted(options.mailbox);
          console.log('✓ Deleted messages permanently removed from server');
        }

        // Disconnect
        await client.disconnect();
        logger.info(`Clean inbox session completed`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in clean inbox: ${errorMsg}`, error instanceof Error ? error : undefined);
        console.error('❌ Error:', errorMsg);
        process.exit(1);
      }
    });

  /**
   * Clean Preview Command
   * Preview emails that would be processed (dry-run)
   */
  clean
    .command('preview')
    .description('Preview emails without processing')
    .requiredOption('-a, --account <name>', 'Account to preview')
    .option('-l, --limit <number>', 'Max emails to show (default: 20)', '20')
    .option('-m, --mailbox <name>', 'Mailbox to preview (default: INBOX)', 'INBOX')
    .option('-u, --unread-only', 'Only show unread emails')
    .option('-o, --output <format>', 'Output format: text or json', 'text')
    .action(async (options) => {
      try {
        const config = loadConfig();
        const account = getAccount(config, options.account);

        const imapConfig = createImapConfig(account);
        const client = new ImapClient(imapConfig);

        await client.connect();

        const fetchOptions: any = {
          mailbox: options.mailbox,
          limit: parseInt(options.limit),
        };

        if (options.unreadOnly) {
          fetchOptions.unseen = true;
        }

        const messages = await client.fetchMessages(fetchOptions);
        await client.disconnect();

        if (messages.length === 0) {
          console.log('📭 No emails found');
          return;
        }

        // Convert and classify
        const cleanEmails = messages.map(msg => convertToCleanInboxEmail(msg));

        if (options.output === 'json') {
          console.log(JSON.stringify(cleanEmails, null, 2));
          return;
        }

        // Text output
        console.log(`\n📧 Clean Inbox Preview - ${account.name}`);
        console.log(`📂 Mailbox: ${options.mailbox}`);
        console.log(`📊 Found ${cleanEmails.length} emails\n`);

        // Group by type
        const automated = cleanEmails.filter(e => e.isAutomated);
        const human = cleanEmails.filter(e => !e.isAutomated);
        const unread = cleanEmails.filter(e => !e.isRead);

        console.log(`📊 Summary:`);
        console.log(`   Total: ${cleanEmails.length}`);
        console.log(`   Unread: ${unread.length}`);
        console.log(`   Human: ${human.length}`);
        console.log(`   Automated: ${automated.length}`);
        console.log('');

        // Show emails
        console.log('📧 Emails:\n');
        for (const email of cleanEmails) {
          const badges: string[] = [];
          if (!email.isRead) badges.push('[Unread]');
          if (email.isAutomated) badges.push('[Auto]');
          const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';

          const sender = email.fromName || email.from;
          console.log(`  ${sender}${badgeStr}`);
          console.log(`  ${email.subject}`);
          console.log(`  ${email.date.toLocaleString()}`);
          console.log('');
        }

        logger.info(`Clean inbox preview: ${cleanEmails.length} emails`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Error in preview: ${errorMsg}`, error instanceof Error ? error : undefined);
        console.error('❌ Error:', errorMsg);
        process.exit(1);
      }
    });

  return clean;
}
