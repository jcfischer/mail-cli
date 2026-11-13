#!/usr/bin/env bun

/**
 * Email CLI
 *
 * Send emails via SMTP with multiple account support and markdown rendering
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { loadConfig, getAccount, listAccounts, getDefaultAccount } from './config';
import { createEmbedCommand } from './commands/embed';
import { createDraftCommand } from './commands/draft';
import { createCleanCommand } from './commands/clean';
import { sendEmail, verifyConnection } from './sender';
import { fetchEmailMessages, createImapConfig, ImapClient } from './imap/client';
import { calculatePriority, getPriorityEmoji, getPriorityLabel } from './filtering/priority';
import { archiveEmails, displayArchivePreview } from './batch/archive';
import { deleteEmails, displayDeletePreview, validateDeleteSafety } from './batch/delete';
import { labelEmails, displayLabelPreview, markAsReadBulk, markAsUnreadBulk } from './batch/label';
import { displayBatchSummary, promptConfirmation } from './batch/operations';
import { generateDigestData, formatDigestMarkdown, formatDigestText, formatDigestVoice, formatDigestBriefing } from './digest/generator';
import { VERSION } from './version';
import type { SendEmailOptions, FetchMessagesOptions } from './types';

import { createLogger } from './logger';
const logger = createLogger('email-skill');

const program = new Command();

program
  .name('email')
  .description('Email CLI - SMTP with multiple accounts and markdown support')
  .version(VERSION);

// Add embed command group (embed config, embed generate, embed search, embed stats)
program.addCommand(createEmbedCommand());

// Add draft command group (draft create)
program.addCommand(createDraftCommand());

// Add clean command group (clean start, clean preview)
program.addCommand(createCleanCommand());

/**
 * Send Command
 * Send an email via SMTP
 */
program
  .command('send')
  .description('Send an email')
  .requiredOption('-t, --to <addresses>', 'Recipient email address(es), comma-separated')
  .requiredOption('-s, --subject <subject>', 'Email subject')
  .option('-b, --body <text>', 'Email body (plain text or markdown)')
  .option('-f, --file <path>', 'Read email body from file')
  .option('--cc <addresses>', 'CC email address(es), comma-separated')
  .option('--bcc <addresses>', 'BCC email address(es), comma-separated')
  .option('--attachment <paths...>', 'Attachment file path(s)')
  .option('-a, --account <name>', 'SMTP account to use (default: config default)')
  .option('--no-markdown', 'Disable markdown rendering (send as plain text)')
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
          console.error('❌ Error: No email body provided (use --body, --file, or stdin)');
          process.exit(1);
        }
        body = stdinBuffer;
      }

      // Parse recipients
      const to = options.to.split(',').map((e: string) => e.trim());
      const cc = options.cc ? options.cc.split(',').map((e: string) => e.trim()) : undefined;
      const bcc = options.bcc ? options.bcc.split(',').map((e: string) => e.trim()) : undefined;

      // Parse attachments
      const attachments = options.attachment
        ? options.attachment.map((path: string) => ({
            filename: path.split('/').pop() || path,
            path: path,
          }))
        : undefined;

      // Prepare send options
      const sendOptions: SendEmailOptions = {
        to,
        subject: options.subject,
        body,
        cc,
        bcc,
        attachments,
        markdown: options.markdown,
      };

      if (options.verbose) {
        console.log('📧 Sending email...');
        console.log(`   Account: ${account.name}`);
        console.log(`   From: ${account.from.name} <${account.from.email}>`);
        console.log(`   To: ${to.join(', ')}`);
        if (cc) console.log(`   CC: ${cc.join(', ')}`);
        if (bcc) console.log(`   BCC: ${bcc.join(', ')}`);
        console.log(`   Subject: ${options.subject}`);
        console.log(`   Markdown: ${options.markdown ? 'yes' : 'no'}`);
        if (attachments) console.log(`   Attachments: ${attachments.map((a: { filename: string }) => a.filename).join(', ')}`);
        console.log('');
      }

      // Send email
      logger.info(`Sending email from ${account.name} to ${to.join(', ')}`);
      const result = await sendEmail(account, sendOptions);

      if (result.success) {
        logger.info(`Email sent successfully (messageId: ${result.messageId})`);
        console.log('✅ Email sent successfully');
        if (options.verbose && result.messageId) {
          console.log(`   Message ID: ${result.messageId}`);
        }
      } else {
        logger.error(`Failed to send email: ${result.error}`);
        console.error('❌ Failed to send email');
        console.error(`   Error: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error sending email: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Accounts Command
 * List configured accounts
 */
program
  .command('accounts')
  .description('List configured SMTP accounts')
  .action(() => {
    try {
      const config = loadConfig();
      const accounts = listAccounts(config);
      const defaultAccount = getDefaultAccount(config);

      logger.info(`Listing ${accounts.length} configured accounts`);
      console.log('📬 Configured Accounts:\n');
      accounts.forEach(name => {
        const account = config.accounts[name];
        const isDefault = name === defaultAccount;
        console.log(`${isDefault ? '• ' : '  '}${name}${isDefault ? ' (default)' : ''}`);
        console.log(`    Name: ${account.from.name}`);
        console.log(`    Email: ${account.from.email}`);
        console.log(`    SMTP: ${account.smtp.host}:${account.smtp.port}`);
        console.log('');
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error listing accounts: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Verify Command
 * Test SMTP connection
 */
program
  .command('verify')
  .description('Verify SMTP connection for an account')
  .option('-a, --account <name>', 'Account to verify (default: config default)')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Verifying SMTP connection for account: ${account.name}`);
      console.log(`🔍 Verifying SMTP connection for: ${account.name}`);
      console.log(`   Host: ${account.smtp.host}:${account.smtp.port}`);
      console.log(`   User: ${account.smtp.auth.user}`);
      console.log('');

      const isValid = await verifyConnection(account);

      if (isValid) {
        logger.info(`SMTP connection successful for ${account.name}`);
        console.log('✅ SMTP connection successful');
      } else {
        logger.error(`SMTP connection failed for ${account.name}`);
        console.error('❌ SMTP connection failed');
        console.error('   Check your configuration and credentials');
        process.exit(1);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error verifying connection: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * List Command
 * List recent emails from inbox
 */
program
  .command('list')
  .description('List recent emails from inbox (requires IMAP)')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-l, --limit <number>', 'Number of emails to fetch (default: 50)', '50')
  .option('-m, --mailbox <name>', 'Mailbox to read from (default: INBOX)', 'INBOX')
  .option('-u, --unseen', 'Only show unseen (unread) emails')
  .option('-s, --since <days>', 'Only show emails from last N days')
  .option('-o, --output <format>', 'Output format: text or json (default: text)', 'text')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Listing emails for account: ${account.name}`);

      if (options.verbose && options.output !== 'json') {
        console.log(`📬 Fetching emails from ${account.name}...`);
        console.log(`   Mailbox: ${options.mailbox}`);
        console.log(`   Limit: ${options.limit}`);
        if (options.unseen) console.log('   Filter: Unseen only');
        if (options.since) console.log(`   Since: Last ${options.since} days`);
        console.log('');
      }

      const fetchOptions: FetchMessagesOptions = {
        mailbox: options.mailbox,
        limit: parseInt(options.limit),
        unseen: options.unseen,
        since: options.since ? new Date(Date.now() - parseInt(options.since) * 24 * 60 * 60 * 1000) : undefined,
      };

      const messages = await fetchEmailMessages(account, fetchOptions);

      logger.info(`Fetched ${messages.length} emails`);

      if (messages.length === 0) {
        if (options.output === 'json') {
          console.log(JSON.stringify([]));
        } else {
          console.log('📭 No emails found');
        }
        return;
      }

      // JSON output
      if (options.output === 'json') {
        const jsonMessages = messages.map(msg => ({
          uid: msg.uid,
          messageId: msg.messageId,
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          date: msg.date.toISOString(),
          snippet: msg.snippet,
          flags: msg.flags,
          hasAttachments: msg.hasAttachments,
          size: msg.size,
        }));
        console.log(JSON.stringify(jsonMessages, null, 2));
        return;
      }

      // Text output (default)
      console.log(`📨 Found ${messages.length} emails:\n`);

      messages.forEach((msg, index) => {
        const isUnread = !msg.flags.includes('\\Seen');
        const unreadMarker = isUnread ? '🔵' : '  ';
        const attachmentMarker = msg.hasAttachments ? '📎' : '  ';

        console.log(`${unreadMarker} ${attachmentMarker} [${index + 1}] ${msg.subject}`);
        console.log(`    From: ${msg.from}`);
        console.log(`    Date: ${msg.date.toLocaleString()}`);
        console.log(`    UID: ${msg.uid}`);

        if (msg.snippet) {
          const snippet = msg.snippet.replace(/\n/g, ' ').substring(0, 100);
          console.log(`    Preview: ${snippet}${msg.snippet.length > 100 ? '...' : ''}`);
        }

        console.log('');
      });

      console.log(`Total: ${messages.length} emails`);
      const unreadCount = messages.filter(m => !m.flags.includes('\\Seen')).length;
      if (unreadCount > 0) {
        console.log(`Unread: ${unreadCount} emails`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error listing emails: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Get Command
 * Get a specific email by UID
 */
program
  .command('get')
  .description('Get a specific email by UID (requires IMAP)')
  .requiredOption('-u, --uid <number>', 'Email UID to fetch')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-m, --mailbox <name>', 'Mailbox to read from (default: INBOX)', 'INBOX')
  .option('--html', 'Show HTML body instead of plain text')
  .option('--mark-read', 'Mark email as read after fetching')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);
      const uid = parseInt(options.uid);

      logger.info(`Fetching email UID ${uid} from account: ${account.name}`);

      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();
      const message = await client.getMessage(uid, options.mailbox);

      if (options.markRead) {
        await client.markAsRead(uid, options.mailbox);
      }

      await client.disconnect();

      if (!message) {
        console.error(`❌ Email with UID ${uid} not found`);
        process.exit(1);
      }

      logger.info(`Fetched email: ${message.subject}`);

      // Display email
      console.log('');
      console.log('━'.repeat(80));
      console.log(`Subject: ${message.subject}`);
      console.log(`From: ${message.from}`);
      console.log(`To: ${message.to.join(', ')}`);
      console.log(`Date: ${message.date.toLocaleString()}`);
      console.log(`UID: ${message.uid}`);
      console.log(`Flags: ${message.flags.join(', ') || 'none'}`);
      if (message.hasAttachments) {
        console.log('📎 Has attachments');
      }
      console.log('━'.repeat(80));
      console.log('');

      if (options.html && message.htmlBody) {
        console.log(message.htmlBody);
      } else if (message.body) {
        console.log(message.body);
      } else {
        console.log('(no body)');
      }

      console.log('');
      console.log('━'.repeat(80));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error fetching email: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Show Command
 * View full email by message ID (looks up UID from local database)
 */
program
  .command('show')
  .description('View full email by message ID (fetches from IMAP)')
  .argument('<messageId>', 'Message ID to fetch (e.g., <abc123@mail.example.com>)')
  .option('-a, --account <name>', 'Account to search in (default: all accounts)')
  .option('--html', 'Show HTML body instead of plain text')
  .option('--mark-read', 'Mark email as read after fetching')
  .action(async (messageId, options) => {
    try {
      // Lazy load search module
      const { findEmailByMessageId, findEmailByMessageIdAllAccounts } = await import('./db/search');

      const config = loadConfig();

      // Find email in local database to get UID and mailbox
      let emailRecord;
      let accountName: string;

      if (options.account) {
        // Search specific account
        emailRecord = await findEmailByMessageId(messageId, options.account);
        accountName = options.account;
      } else {
        // Search all accounts
        const accounts = Object.keys(config.accounts);
        emailRecord = await findEmailByMessageIdAllAccounts(messageId, accounts);
        accountName = emailRecord?.account || '';
      }

      if (!emailRecord) {
        console.error(`❌ Email not found in local database: ${messageId}`);
        console.error('   Run `email sync` to index emails first.');
        process.exit(1);
      }

      logger.info(`Found email in account ${accountName}, UID: ${emailRecord.uid}, mailbox: ${emailRecord.mailbox}`);

      // Fetch full email via IMAP
      const account = getAccount(config, accountName);
      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();
      const message = await client.getMessage(emailRecord.uid, emailRecord.mailbox);

      if (options.markRead && message) {
        await client.markAsRead(emailRecord.uid, emailRecord.mailbox);
      }

      await client.disconnect();

      if (!message) {
        console.error(`❌ Email not found on server (UID: ${emailRecord.uid})`);
        console.error('   The email may have been deleted. Run `email sync` to update the index.');
        process.exit(1);
      }

      logger.info(`Fetched email: ${message.subject}`);

      // Display email
      console.log('');
      console.log('━'.repeat(80));
      console.log(`Subject: ${message.subject}`);
      console.log(`From: ${message.from}`);
      console.log(`To: ${message.to.join(', ')}`);
      console.log(`Date: ${message.date.toLocaleString()}`);
      console.log(`Message-ID: ${messageId}`);
      console.log(`Account: ${accountName}`);
      console.log(`Mailbox: ${emailRecord.mailbox}`);
      console.log(`Flags: ${message.flags.join(', ') || 'none'}`);
      if (message.hasAttachments) {
        console.log('📎 Has attachments');
      }
      console.log('━'.repeat(80));
      console.log('');

      if (options.html && message.htmlBody) {
        console.log(message.htmlBody);
      } else if (message.body) {
        console.log(message.body);
      } else {
        console.log('(no body)');
      }

      console.log('');
      console.log('━'.repeat(80));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error showing email: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Mailboxes Command
 * List all available mailboxes for an account
 */
program
  .command('mailboxes')
  .description('List all available mailboxes/folders (requires IMAP)')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-o, --output <format>', 'Output format: text or json (default: text)', 'text')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Listing mailboxes for account: ${account.name}`);

      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();
      const mailboxes = await client.listMailboxes();
      await client.disconnect();

      logger.info(`Found ${mailboxes.length} mailboxes`);

      if (options.output === 'json') {
        console.log(JSON.stringify(mailboxes, null, 2));
        return;
      }

      console.log(`📁 Available mailboxes for ${account.name}:\n`);
      mailboxes.forEach((box, index) => {
        const specialUse = box.specialUse ? ` (${box.specialUse})` : '';
        console.log(`  [${index + 1}] ${box.path}${specialUse}`);
      });
      console.log(`\nTotal: ${mailboxes.length} mailboxes`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error listing mailboxes: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Filter Command
 * Analyze email priorities
 */
program
  .command('filter')
  .description('Analyze email priorities with smart filtering')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-l, --limit <number>', 'Number of emails to analyze (default: 50)', '50')
  .option('-m, --mailbox <name>', 'Mailbox to analyze (default: INBOX)', 'INBOX')
  .option('--vip <senders...>', 'VIP sender email addresses or domains')
  .option('--show-all', 'Show all emails (default: only urgent/normal)')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Analyzing email priorities for account: ${account.name}`);
      console.log(`🔍 Analyzing email priorities for ${account.name}...\n`);

      const fetchOptions: FetchMessagesOptions = {
        mailbox: options.mailbox,
        limit: parseInt(options.limit),
      };

      const messages = await fetchEmailMessages(account, fetchOptions);

      if (messages.length === 0) {
        console.log('📭 No emails found');
        return;
      }

      const vipSenders = options.vip || [];

      // Analyze each email
      const analyzed = messages.map(msg => ({
        message: msg,
        priority: calculatePriority(msg, vipSenders),
      }));

      // Sort by priority score (descending)
      analyzed.sort((a, b) => b.priority.score - a.priority.score);

      // Group by priority
      const urgent = analyzed.filter(a => a.priority.level === 'urgent');
      const normal = analyzed.filter(a => a.priority.level === 'normal');
      const low = analyzed.filter(a => a.priority.level === 'low');

      // Display summary
      console.log('📊 Priority Summary:');
      console.log(`   🔴 Urgent: ${urgent.length} emails`);
      console.log(`   🟡 Normal: ${normal.length} emails`);
      console.log(`   🟢 Low: ${low.length} emails`);
      console.log('');

      // Display urgent emails
      if (urgent.length > 0) {
        console.log('🔴 URGENT EMAILS (Requires Immediate Attention):\n');
        urgent.forEach((item, index) => {
          const msg = item.message;
          const priority = item.priority;
          console.log(`[${index + 1}] ${msg.subject}`);
          console.log(`    From: ${msg.from}`);
          console.log(`    Date: ${msg.date.toLocaleString()}`);
          console.log(`    Score: ${priority.score}/100`);
          console.log(`    Reasons: ${priority.reasoning.join(', ')}`);
          console.log('');
        });
      }

      // Display normal emails
      if (normal.length > 0 && options.showAll) {
        console.log('🟡 NORMAL EMAILS (Review Today):\n');
        normal.slice(0, 10).forEach((item, index) => {
          const msg = item.message;
          console.log(`[${index + 1}] ${msg.subject}`);
          console.log(`    From: ${msg.from}`);
          console.log(`    Date: ${msg.date.toLocaleString()}`);
          console.log('');
        });
        if (normal.length > 10) {
          console.log(`... and ${normal.length - 10} more normal priority emails\n`);
        }
      }

      // Display low priority count
      if (low.length > 0) {
        console.log(`🟢 LOW PRIORITY: ${low.length} emails (newsletters, promos)\n`);
        if (options.showAll) {
          low.slice(0, 5).forEach((item, index) => {
            const msg = item.message;
            console.log(`[${index + 1}] ${msg.subject}`);
            console.log(`    From: ${msg.from}`);
            console.log('');
          });
          if (low.length > 5) {
            console.log(`... and ${low.length - 5} more low priority emails\n`);
          }
        }
      }

      console.log('━'.repeat(80));
      console.log(`Total: ${messages.length} emails analyzed`);
      console.log(`Recommendation: Focus on ${urgent.length} urgent + ${normal.length} normal = ${urgent.length + normal.length} emails`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error filtering emails: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Batch Archive Command
 * Archive old/read emails in bulk
 */
program
  .command('batch-archive')
  .description('Archive emails in bulk (move to Archive folder)')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-m, --mailbox <name>', 'Mailbox to process (default: INBOX)', 'INBOX')
  .option('--older-than <days>', 'Archive emails older than N days')
  .option('--read-only', 'Only archive read emails')
  .option('--limit <number>', 'Limit number of emails to process (default: 1000)', '1000')
  .option('--dry-run', 'Preview changes without applying them (default)')
  .option('--apply', 'Apply the archive operation (requires confirmation)')
  .option('--target <mailbox>', 'Target mailbox for archiving (default: Archive)', 'Archive')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Batch archive for account: ${account.name}`);
      console.log(`📦 Batch Archive for ${account.name}\n`);

      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();

      // Build fetch options with server-side date filtering
      const fetchOptions: any = {
        mailbox: options.mailbox,
        limit: 0, // Fetch ALL matching messages, no limit
      };

      // Calculate cutoff date for --older-than
      if (options.olderThan) {
        const days = parseInt(options.olderThan);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        fetchOptions.before = cutoffDate; // Use IMAP server-side filtering
      }

      // Fetch messages (IMAP does the date filtering)
      const messages = await client.fetchMessages(fetchOptions);

      if (messages.length === 0) {
        console.log('📭 No emails found matching criteria');
        await client.disconnect();
        return;
      }

      // Filter by read status (client-side, as IMAP search already filtered by date)
      let filtered = messages;
      if (options.readOnly) {
        filtered = filtered.filter(msg => msg.flags.includes('\\Seen'));
      }

      // Display preview
      displayArchivePreview(filtered, {
        olderThanDays: options.olderThan ? parseInt(options.olderThan) : undefined,
        readOnly: options.readOnly,
        targetMailbox: options.target,
      });

      // Execute operation
      const dryRun = !options.apply;

      if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes made');
        console.log('   Run with --apply to execute the archive operation\n');
        await client.disconnect();
        return;
      }

      // Confirm before applying
      const confirmed = await promptConfirmation(
        `Archive ${filtered.length} emails to ${options.target}?`
      );

      if (!confirmed) {
        console.log('❌ Operation cancelled by user');
        await client.disconnect();
        return;
      }

      // Execute archive
      const result = await archiveEmails(client, filtered, {
        targetMailbox: options.target,
        dryRun: false,
      });

      await client.disconnect();

      // Display results
      displayBatchSummary('archive', filtered, result);
      logger.info(`Batch archive completed: ${result.processed} emails archived`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in batch archive: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Batch Delete Command
 * Delete emails in bulk with safety checks
 */
program
  .command('batch-delete')
  .description('Delete emails in bulk (with safety checks)')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-m, --mailbox <name>', 'Mailbox to process (default: INBOX)', 'INBOX')
  .option('--older-than <days>', 'Delete emails older than N days')
  .option('--keywords <keywords...>', 'Delete emails with these keywords in subject')
  .option('--limit <number>', 'Limit number of emails to process (default: 1000)', '1000')
  .option('--dry-run', 'Preview changes without applying them (default)')
  .option('--apply', 'Apply the delete operation (requires confirmation)')
  .option('--permanent', 'Permanently delete (WARNING: cannot be undone)')
  .option('--trash <mailbox>', 'Trash mailbox name (default: Trash)', 'Trash')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Batch delete for account: ${account.name}`);
      console.log(`🗑️  Batch Delete for ${account.name}\n`);

      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();

      // Fetch messages
      const messages = await client.fetchMessages({
        mailbox: options.mailbox,
        limit: parseInt(options.limit),
      });

      if (messages.length === 0) {
        console.log('📭 No emails found');
        await client.disconnect();
        return;
      }

      // Filter by criteria
      let filtered = messages;
      if (options.olderThan) {
        const days = parseInt(options.olderThan);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        filtered = filtered.filter(msg => msg.date < cutoffDate);
      }

      if (options.keywords && options.keywords.length > 0) {
        filtered = filtered.filter(msg =>
          options.keywords.some((kw: string) =>
            msg.subject.toLowerCase().includes(kw.toLowerCase())
          )
        );
      }

      // Validate safety
      const warnings = validateDeleteSafety(filtered, {
        permanent: options.permanent,
      });

      // Display preview
      displayDeletePreview(filtered, {
        olderThanDays: options.olderThan ? parseInt(options.olderThan) : undefined,
        keywords: options.keywords,
        permanent: options.permanent,
      });

      if (warnings.length > 0) {
        console.log('⚠️  Safety Warnings:');
        warnings.forEach(warning => console.log(`   - ${warning}`));
        console.log('');
      }

      // Execute operation
      const dryRun = !options.apply;

      if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes made');
        console.log('   Run with --apply to execute the delete operation\n');
        await client.disconnect();
        return;
      }

      // Confirm before applying
      const confirmMessage = options.permanent
        ? `⚠️  PERMANENTLY DELETE ${filtered.length} emails? THIS CANNOT BE UNDONE!`
        : `Move ${filtered.length} emails to ${options.trash}?`;

      const confirmed = await promptConfirmation(confirmMessage);

      if (!confirmed) {
        console.log('❌ Operation cancelled by user');
        await client.disconnect();
        return;
      }

      // Execute delete
      const result = await deleteEmails(client, filtered, {
        permanent: options.permanent,
        trashMailbox: options.trash,
        dryRun: false,
      });

      await client.disconnect();

      // Display results
      displayBatchSummary('delete', filtered, result);
      logger.info(`Batch delete completed: ${result.processed} emails deleted`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in batch delete: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Batch Label Command
 * Move emails to folders based on criteria
 */
program
  .command('batch-label')
  .description('Move emails to a folder/label in bulk')
  .requiredOption('--to <mailbox>', 'Target mailbox/folder to move emails to')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-m, --mailbox <name>', 'Source mailbox to process (default: INBOX)', 'INBOX')
  .option('--keywords <keywords...>', 'Move emails with these keywords in subject')
  .option('--priority <level>', 'Move emails with this priority (urgent/normal/low)')
  .option('--has-unsubscribe', 'Move emails with unsubscribe link (newsletters)')
  .option('--limit <number>', 'Limit number of emails to process (default: 1000)', '1000')
  .option('--dry-run', 'Preview changes without applying them (default)')
  .option('--apply', 'Apply the label/move operation (requires confirmation)')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Batch label for account: ${account.name}`);
      console.log(`🏷️  Batch Label/Move for ${account.name}\n`);

      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);

      await client.connect();

      // Fetch messages
      const messages = await client.fetchMessages({
        mailbox: options.mailbox,
        limit: parseInt(options.limit),
      });

      if (messages.length === 0) {
        console.log('📭 No emails found');
        await client.disconnect();
        return;
      }

      // Filter by criteria (done inside labelEmails)
      const labelOptions = {
        targetMailbox: options.to,
        keywords: options.keywords,
        priority: options.priority,
        hasUnsubscribe: options.hasUnsubscribe,
        dryRun: true, // First run as dry-run to get filtered count
      };

      // Get filtered messages for preview
      let filtered = messages;
      if (options.keywords && options.keywords.length > 0) {
        filtered = filtered.filter(msg =>
          options.keywords.some((kw: string) =>
            msg.subject.toLowerCase().includes(kw.toLowerCase())
          )
        );
      }

      if (options.priority) {
        filtered = filtered.filter(msg => {
          const result = calculatePriority(msg);
          return result.level === options.priority;
        });
      }

      if (options.hasUnsubscribe !== undefined) {
        filtered = filtered.filter(msg => {
          const text = `${msg.subject} ${msg.snippet || ''}`.toLowerCase();
          return text.includes('unsubscribe');
        });
      }

      // Display preview
      displayLabelPreview(filtered, labelOptions);

      // Execute operation
      const dryRun = !options.apply;

      if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes made');
        console.log('   Run with --apply to execute the move operation\n');
        await client.disconnect();
        return;
      }

      // Confirm before applying
      const confirmed = await promptConfirmation(
        `Move ${filtered.length} emails to ${options.to}?`
      );

      if (!confirmed) {
        console.log('❌ Operation cancelled by user');
        await client.disconnect();
        return;
      }

      // Execute label/move
      const result = await labelEmails(client, filtered, {
        ...labelOptions,
        dryRun: false,
      });

      await client.disconnect();

      // Display results
      displayBatchSummary('label', filtered, result);
      logger.info(`Batch label completed: ${result.processed} emails moved to ${options.to}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in batch label: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Digest Command
 * Generate email digest with statistics
 */
program
  .command('digest')
  .description('Generate email digest (daily summary)')
  .option('-a, --account <name>', 'Account to use (default: config default)')
  .option('-m, --mailbox <name>', 'Mailbox to analyze (default: INBOX)', 'INBOX')
  .option('-l, --limit <number>', 'Number of emails to analyze (default: 100)', '100')
  .option('--period <period>', 'Period for digest (today/week/month)', 'today')
  .option('--vip <senders...>', 'VIP sender email addresses or domains')
  .option('--format <format>', 'Output format (markdown/text/voice)', 'markdown')
  .option('--max-urgent <number>', 'Max urgent emails to show (default: 10)', '10')
  .option('--max-normal <number>', 'Max normal emails to show (default: 5)', '5')
  .option('--no-stats', 'Disable statistics')
  .option('--output <file>', 'Write digest to file')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const account = getAccount(config, options.account);

      logger.info(`Generating email digest for account: ${account.name}`);

      const messages = await fetchEmailMessages(account, {
        mailbox: options.mailbox,
        limit: parseInt(options.limit),
      });

      if (messages.length === 0) {
        console.log('📭 No emails found');
        return;
      }

      // Generate digest data
      const digestData = generateDigestData(messages, {
        period: options.period,
        vipSenders: options.vip || [],
        includeStats: options.stats !== false,
        format: options.format,
        maxUrgent: parseInt(options.maxUrgent),
        maxNormal: parseInt(options.maxNormal),
      });

      // Format digest based on output format
      let output: string;
      switch (options.format) {
        case 'text':
          output = formatDigestText(digestData);
          break;
        case 'voice':
          output = formatDigestVoice(digestData);
          break;
        case 'briefing':
          // Return JSON for daily briefing integration
          const briefingData = formatDigestBriefing(digestData);
          output = JSON.stringify(briefingData, null, 2);
          break;
        case 'markdown':
        default:
          output = formatDigestMarkdown(digestData);
          break;
      }

      // Output to file or console
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, output, 'utf-8');
        console.log(`✅ Digest written to ${options.output}`);
        logger.info(`Digest written to ${options.output}`);
      } else {
        console.log(output);
      }

      logger.info(`Digest generated: ${digestData.summary.urgent} urgent, ${digestData.summary.normal} normal, ${digestData.summary.low} low`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error generating digest: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Index Command
 * Index emails from IMAP to SQLite database
 */
program
  .command('index')
  .description('Index emails from IMAP to local database for analytics')
  .option('-a, --account <name>', 'Account to index (default: config default)')
  .option('-m, --mailbox <name>', 'Mailbox to index (default: INBOX)', 'INBOX')
  .option('-l, --limit <number>', 'Max emails to index (0 = all)', '0')
  .option('--since <days>', 'Only index emails from last N days')
  .option('--full', 'Re-index all emails (slow, updates existing records)')
  .action(async (options) => {
    try {
      // Lazy load database modules (only when needed)
      const { EmailIndexer } = await import('./db/indexer');
      const { getDatabaseStats } = await import('./db/client');

      const config = loadConfig();
      const account = getAccount(config, options.account);

      console.log(`📊 Indexing emails for account: ${account.name}`);
      console.log(`📂 Mailbox: ${options.mailbox}`);

      // Calculate since date if provided
      let since: Date | undefined;
      if (options.since) {
        const days = parseInt(options.since);
        since = new Date();
        since.setDate(since.getDate() - days);
        console.log(`📅 Since: ${since.toLocaleDateString()}`);
      }

      // Create IMAP client and connect
      const imapConfig = createImapConfig(account);
      const client = new ImapClient(imapConfig);
      await client.connect();

      // Create indexer with account name for per-account database
      const indexer = new EmailIndexer(client, account.name);

      // Start indexing
      const startTime = Date.now();
      console.log('⏳ Indexing...');

      try {
        const result = await indexer.indexEmails({
          account: account.name,
          mailbox: options.mailbox,
          limit: parseInt(options.limit),
          since,
          full: options.full || false,
        });

        // Display results
        const duration = (result.duration / 1000).toFixed(2);
        console.log('');
        console.log('✅ Indexing complete!');
        console.log('');
        console.log(`📥 Indexed: ${result.indexed} new emails`);
        console.log(`🔄 Updated: ${result.updated} existing emails`);
        console.log(`⏭️  Skipped: ${result.skipped} unchanged emails`);
        if (result.errors > 0) {
          console.log(`❌ Errors: ${result.errors}`);
        }
        console.log(`⏱️  Duration: ${duration}s`);
        console.log('');

        // Show database stats for this account
        const dbStats = getDatabaseStats(account.name);
        console.log(`📊 Database: ${dbStats.emailCount.toLocaleString()} total emails indexed`);

        logger.info(`Index complete: ${result.indexed} new, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors in ${duration}s`);
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error indexing emails: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Stats Command
 * Show email statistics and analytics
 */
program
  .command('stats')
  .description('Show email statistics and analytics')
  .option('-a, --account <name>', 'Account to analyze (default: config default)')
  .option('--all', 'Show stats for all accounts')
  .option('-p, --period <period>', 'Period: day, week, month (default: week)', 'week')
  .option('--senders', 'Show top senders statistics')
  .option('--volume', 'Show volume trend')
  .option('--priority', 'Show priority distribution')
  .action(async (options) => {
    try {
      // Lazy load database modules (only when needed)
      const { EmailStatsEngine } = await import('./db/stats');
      const { getDatabaseStats, getAllDatabaseStats } = await import('./db/client');

      const config = loadConfig();

      // Handle --all option
      if (options.all) {
        const accounts = Object.keys(config.accounts);
        const allStats = getAllDatabaseStats(accounts);

        console.log('📊 Email Statistics - All Accounts\n');
        console.log(`💾 Total: ${allStats.totalEmails.toLocaleString()} emails indexed`);
        console.log(`📦 Total Size: ${(allStats.totalSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📂 Config Dir: ${allStats.configDir}\n`);

        console.log('📬 Per Account:');
        for (const [accountName, stats] of Object.entries(allStats.perAccount)) {
          console.log(`  ${accountName}: ${stats.emailCount.toLocaleString()} emails`);
          console.log(`    └─ ${stats.dbPath}`);
        }
        console.log('');

        logger.info(`Stats displayed for all accounts: ${allStats.totalEmails} total emails`);
        return;
      }

      const accountName = options.account || config.defaultAccount;
      const account = getAccount(config, accountName);
      const statsEngine = new EmailStatsEngine();

      // Validate period
      if (!['day', 'week', 'month'].includes(options.period)) {
        console.error('❌ Error: Period must be day, week, or month');
        process.exit(1);
      }

      console.log(`📊 Email Statistics - ${account.name} (${options.period})`);
      console.log('');

      // Get user's email address to exclude from sender statistics
      const userEmail = account.from.email;

      // Get main statistics
      const stats = await statsEngine.getStats({
        account: accountName, // Use account identifier, not display name
        period: options.period as 'day' | 'week' | 'month',
        excludeUserEmail: userEmail,
      });

      // Display summary
      console.log(`📅 Period: ${stats.period}`);
      console.log(`📧 Total Emails: ${stats.totalEmails.toLocaleString()}`);
      console.log('');

      // Status breakdown
      console.log('📬 Status:');
      console.log(`  ✅ Read: ${stats.readEmails} (${stats.readRate}%)`);
      console.log(`  📭 Unread: ${stats.unreadEmails}`);
      console.log(`  ⭐ Starred: ${stats.starredEmails}`);
      console.log(`  📁 Archived: ${stats.archivedEmails}`);
      console.log('');

      // Priority breakdown
      console.log('🎯 Priority:');
      console.log(`  🔴 Urgent: ${stats.urgentEmails}`);
      console.log(`  🟡 Normal: ${stats.normalEmails}`);
      console.log(`  🟢 Low: ${stats.lowPriorityEmails}`);
      console.log('');

      // Attachments
      console.log(`📎 With Attachments: ${stats.withAttachments}`);
      console.log('');

      // Top senders (or show detailed sender stats)
      if (options.senders) {
        const senderStats = await statsEngine.getSenderStats(accountName, 20, options.period as 'day' | 'week' | 'month', userEmail);
        console.log('👥 Top Senders:');
        for (const sender of senderStats.slice(0, 10)) {
          const name = sender.name || sender.email;
          const unreadBadge = sender.unreadEmails > 0 ? ` (${sender.unreadEmails} unread)` : '';
          console.log(`  ${sender.totalEmails.toString().padStart(4)} - ${name}${unreadBadge}`);
        }
        console.log('');
      } else {
        console.log('👥 Top Senders:');
        for (const sender of stats.topSenders.slice(0, 5)) {
          const name = sender.name || sender.email;
          console.log(`  ${sender.count.toString().padStart(3)} - ${name}`);
        }
        console.log('');
      }

      // Volume trend
      if (options.volume) {
        const trend = await statsEngine.getVolumeTrend(accountName, 30);
        console.log('📈 Volume Trend (Last 30 Days):');
        for (const day of trend.slice(-14)) { // Show last 14 days
          const bar = '█'.repeat(Math.ceil(day.count / 5));
          console.log(`  ${day.date}: ${bar} ${day.count}`);
        }
        console.log('');
      }

      // Priority distribution
      if (options.priority) {
        const priorityDist = await statsEngine.getPriorityDistribution(accountName, options.period as 'day' | 'week' | 'month');
        console.log('📊 Priority Distribution:');
        const total = priorityDist.urgent + priorityDist.normal + priorityDist.low;
        if (total > 0) {
          const urgentPct = Math.round((priorityDist.urgent / total) * 100);
          const normalPct = Math.round((priorityDist.normal / total) * 100);
          const lowPct = Math.round((priorityDist.low / total) * 100);
          console.log(`  🔴 Urgent: ${priorityDist.urgent} (${urgentPct}%)`);
          console.log(`  🟡 Normal: ${priorityDist.normal} (${normalPct}%)`);
          console.log(`  🟢 Low: ${priorityDist.low} (${lowPct}%)`);
        }
        console.log('');
      }

      // Database info for this account
      const dbStats = getDatabaseStats(accountName);
      console.log(`💾 Database: ${dbStats.emailCount.toLocaleString()} total emails indexed`);
      console.log(`📦 Size: ${(dbStats.dbSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`📂 Path: ${dbStats.dbPath}`);

      logger.info(`Stats displayed for ${accountName}: ${stats.totalEmails} emails`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting stats: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Search Command
 * Full-text search across indexed emails
 */
program
  .command('search')
  .description('Search emails using full-text search')
  .argument('<query>', 'Search query')
  .option('-a, --account <name>', 'Filter by account')
  .option('-m, --mailbox <name>', 'Filter by mailbox')
  .option('-l, --limit <number>', 'Max results (default: 20)', '20')
  .option('--unread', 'Show only unread emails')
  .option('--from <email>', 'Filter by sender email address (partial match)')
  .option('--to <email>', 'Filter by recipient email address (partial match)')
  .option('-o, --output <format>', 'Output format: text or json (default: text)', 'text')
  .action(async (query, options) => {
    try {
      // Lazy load search module
      const { searchEmails, searchEmailsAllAccounts } = await import('./db/search');
      const config = loadConfig();

      // Execute search - if account specified, use it; otherwise search all accounts
      let results;
      if (options.account) {
        results = await searchEmails(query, {
          account: options.account,
          mailbox: options.mailbox,
          limit: parseInt(options.limit),
          unread: options.unread,
          from: options.from,
          to: options.to,
        });
      } else {
        // Search all accounts
        const accounts = Object.keys(config.accounts);
        results = await searchEmailsAllAccounts(query, accounts, {
          mailbox: options.mailbox,
          limit: parseInt(options.limit),
          unread: options.unread,
          from: options.from,
          to: options.to,
        });
      }

      if (results.length === 0) {
        console.log('📭 No emails found matching your query');
        return;
      }

      if (options.output === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`\n🔍 Found ${results.length} emails:\n`);

        for (const email of results) {
          const date = new Date(email.date);
          const readStatus = email.isRead ? '✅' : '📬';
          const priorityEmoji = email.priority >= 80 ? '🔴' : email.priority >= 50 ? '🟡' : '🟢';

          console.log(`${readStatus} ${priorityEmoji} ${email.subject}`);
          console.log(`   From: ${email.fromName || email.from}`);
          console.log(`   Date: ${date.toLocaleString()}`);
          console.log(`   Account: ${email.account} | Mailbox: ${email.mailbox}`);

          if (email.snippet) {
            const snippet = email.snippet.substring(0, 100);
            console.log(`   ${snippet}${email.snippet.length > 100 ? '...' : ''}`);
          }

          console.log('');
        }
      }

      logger.info(`Search completed: ${results.length} results for "${query}"`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error searching emails: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });



/**
 * Sync Command
 * Incremental sync of emails from IMAP to database
 */
program
  .command('sync')
  .description('Sync emails from IMAP to local database (incremental)')
  .option('-a, --account <name>', 'Account to sync (default: all accounts)')
  .option('-m, --mailboxes <names...>', 'Mailboxes to sync (overrides config, default: INBOX, Archive, Sent)')
  .option('--full', 'Force full resync (ignores last sync state)')
  .option('-v, --verbose', 'Show detailed progress during sync')
  .action(async (options) => {
    try {
      // Lazy load sync engine
      const { SyncEngine } = await import('./sync/engine');

      const config = loadConfig();
      const syncEngine = new SyncEngine();

      // Determine which accounts to sync
      const accountsToSync: string[] = [];
      if (options.account) {
        accountsToSync.push(options.account);
      } else {
        // Sync all accounts
        accountsToSync.push(...Object.keys(config.accounts));
      }

      console.log(`\n🔄 Email Sync${options.full ? ' (FULL)' : ''}${options.verbose ? ' (VERBOSE)' : ''}\n`);

      // Sync each account
      for (const accountName of accountsToSync) {
        const account = getAccount(config, accountName);

        const result = await syncEngine.syncAccount({
          account: accountName,
          accountConfig: account,
          mailboxes: options.mailboxes,
          full: options.full || false,
          verbose: options.verbose || false,
        });

        const duration = (result.duration / 1000).toFixed(2);
        console.log(`✅ ${accountName} synced in ${duration}s`);
        console.log(`   📥 ${result.totalIndexed} new, ${result.totalUpdated} updated, ${result.totalSkipped} skipped\n`);

        logger.info(`Sync complete for ${accountName}: ${result.totalIndexed} new, ${result.totalUpdated} updated in ${duration}s`);
      }

      console.log('🎉 Sync complete!\n');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error syncing emails: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Sync Status Command
 * Show sync status for all accounts
 */
program
  .command('sync-status')
  .description('Show sync status for all accounts and mailboxes')
  .action(async () => {
    try {
      // Lazy load sync engine
      const { SyncEngine } = await import('./sync/engine');
      const config = loadConfig();

      const syncEngine = new SyncEngine();
      const accounts = Object.keys(config.accounts);
      const allStates = await syncEngine.getSyncStatus(accounts);

      if (allStates.length === 0) {
        console.log('📭 No sync state found. Run `email sync` to start syncing.');
        return;
      }

      console.log('\n📊 Sync Status\n');

      for (const state of allStates) {
        const lastSync = new Date(state.lastSyncTimestamp);
        const timeSince = Math.floor((Date.now() - state.lastSyncTimestamp) / 1000 / 60); // minutes
        const timeSinceStr = timeSince < 60
          ? `${timeSince}m ago`
          : timeSince < 1440
            ? `${Math.floor(timeSince / 60)}h ago`
            : `${Math.floor(timeSince / 1440)}d ago`;

        console.log(`📂 ${state.account}/${state.mailbox}`);
        console.log(`   Last sync: ${lastSync.toLocaleString()} (${timeSinceStr})`);
        console.log(`   Last UID: ${state.lastSyncUid || 'N/A'}`);
        console.log(`   Total messages: ${state.totalMessages}`);
        console.log(`   Last run: ${state.messagesIndexed} new, ${state.messagesUpdated} updated`);

        if (state.lastError) {
          console.log(`   ⚠️  Last error: ${state.lastError}`);
        }

        console.log('');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting sync status: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Sync Reset Command
 * Reset sync state to force full resync
 */
program
  .command('sync-reset')
  .description('Reset sync state (forces full resync next time)')
  .requiredOption('-a, --account <name>', 'Account to reset')
  .option('-m, --mailbox <name>', 'Mailbox to reset (default: all mailboxes)')
  .action(async (options) => {
    try {
      // Lazy load sync engine
      const { SyncEngine } = await import('./sync/engine');

      const syncEngine = new SyncEngine();

      await syncEngine.resetSyncState(options.account, options.mailbox);

      if (options.mailbox) {
        console.log(`✅ Reset sync state for ${options.account}/${options.mailbox}`);
        logger.info(`Sync state reset for ${options.account}/${options.mailbox}`);
      } else {
        console.log(`✅ Reset all sync state for ${options.account}`);
        logger.info(`All sync state reset for ${options.account}`);
      }

      console.log('💡 Next sync will be a full resync\n');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error resetting sync state: ${errorMsg}`, error instanceof Error ? error : undefined);
      console.error('❌ Error:', errorMsg);
      process.exit(1);
    }
  });

/**
 * Help text with examples
 */
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('');
  console.log('  # Send plain text email');
  console.log('  email send -t user@example.com -s "Hello" -b "This is a test"');
  console.log('');
  console.log('  # Send markdown email');
  console.log('  email send -t user@example.com -s "Report" -b "# Summary\\n\\nHere are the **results**"');
  console.log('');
  console.log('  # Send from specific account');
  console.log('  email send -t user@example.com -s "Hello" -b "Test" -a work');
  console.log('');
  console.log('  # List recent emails');
  console.log('  email list -a personal --limit 20');
  console.log('');
  console.log('  # List unread emails only');
  console.log('  email list -a personal --unseen');
  console.log('');
  console.log('  # Get specific email by UID');
  console.log('  email get --uid 12345 -a personal');
  console.log('');
  console.log('  # Analyze email priorities');
  console.log('  email filter -a personal');
  console.log('');
  console.log('  # Filter with VIP senders');
  console.log('  email filter -a personal --vip boss@company.com manager@company.com');
  console.log('');
  console.log('  # Archive read emails older than 7 days (dry-run)');
  console.log('  email batch-archive -a personal --older-than 7 --read-only --dry-run');
  console.log('');
  console.log('  # Archive read emails older than 7 days (apply)');
  console.log('  email batch-archive -a personal --older-than 7 --read-only --apply');
  console.log('');
  console.log('  # Delete promotional emails (dry-run)');
  console.log('  email batch-delete -a personal --keywords sale discount promo --dry-run');
  console.log('');
  console.log('  # Move newsletters to Newsletters folder');
  console.log('  email batch-label --to Newsletters --has-unsubscribe --apply');
  console.log('');
  console.log('  # Move low priority emails to Later folder');
  console.log('  email batch-label --to Later --priority low --dry-run');
  console.log('');
  console.log('  # Generate daily email digest (markdown)');
  console.log('  email digest -a personal');
  console.log('');
  console.log('  # Generate digest with voice output');
  console.log('  email digest -a personal --format voice');
  console.log('');
  console.log('  # Save digest to file');
  console.log('  email digest -a personal --output ~/digest.md');
  console.log('');
  console.log('  # Index emails to database');
  console.log('  email index -a personal');
  console.log('');
  console.log('  # Index last 30 days only');
  console.log('  email index -a personal --since 30');
  console.log('');
  console.log('  # Show email statistics');
  console.log('  email stats -a personal');
  console.log('');
  console.log('  # Show weekly stats with sender details');
  console.log('  email stats -a personal --period week --senders');
  console.log('');
  console.log('  # Show volume trend and priority distribution');
  console.log('  email stats -a personal --volume --priority');
  console.log('');
  console.log('  # Sync all accounts (incremental)');
  console.log('  email sync');
  console.log('');
  console.log('  # Sync specific account');
  console.log('  email sync -a personal');
  console.log('');
  console.log('  # Force full resync');
  console.log('  email sync -a personal --full');
  console.log('');
  console.log('  # Check sync status');
  console.log('  email sync-status');
  console.log('');
  console.log('  # Reset sync state (force full resync next time)');
  console.log('  email sync-reset -a personal');
  console.log('');
  console.log('  # List accounts');
  console.log('  email accounts');
  console.log('');
  console.log('  # Verify SMTP connection');
  console.log('  email verify -a personal');
  console.log('');
  console.log('Configuration:');
  console.log('  Config file: ~/.config/email/config.json');
  console.log('  Example: docs/config-example.json');
  console.log('');
});

// Parse arguments
// ============================================================================
// Security Commands
// ============================================================================

/**
 * Store password in macOS keychain
 */
program
  .command('keychain-set')
  .description('Store a password in macOS keychain')
  .requiredOption('-s, --service <name>', 'Service name (e.g., email-personal-smtp)')
  .requiredOption('-p, --password <password>', 'Password to store')
  .option('-a, --account <account>', 'Account name (default: $USER)')
  .action(async (options) => {
    const { storeKeychainPassword } = await import('./security');

    try {
      storeKeychainPassword(options.service, options.password, options.account);
      console.log('');
      console.log('✓ Password stored in keychain');
      console.log('');
      console.log('📋 Update your config file to use this keychain entry:');
      console.log(`   "pass": "keychain:${options.service}"`);
      console.log('');
    } catch (error) {
      console.error(`❌ Failed to store password: ${error}`);
      process.exit(1);
    }
  });

/**
 * Security check command
 */
program
  .command('security-check')
  .description('Check email configuration security')
  .action(async () => {
    const { initializeSecurity, validateConfigSecurity, displaySecurityRecommendations } = await import('./security');

    try {
      // Initialize security checks
      initializeSecurity();

      // Load and validate config
      const config = loadConfig();
      const warnings = validateConfigSecurity(config);

      if (warnings.length === 0) {
        console.log('✅ No security issues found!');
        console.log('');
      } else {
        displaySecurityRecommendations(warnings);
      }
    } catch (error) {
      console.error(`❌ Security check failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();
