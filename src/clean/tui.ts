/**
 * Clean Inbox TUI (Text User Interface)
 * Interactive email processing with readline
 */

import type { MessageUID } from '../imap/types';
import * as readline from 'readline';
import type { CleanInboxSession, CleanInboxEmail, SessionAction } from '../types';
import { currentEmail, nextEmail, recordAction, getSessionSummary } from './session';
import { formatEmailView, formatSessionStats } from './display';
import { parseActionKey, type ActionType } from './input';
import {
  createDeleteAction,
  createArchiveAction,
  createSkipAction,
  createReplyAction,
  createTodoAction,
} from './actions';
import { executeAction } from './executor';
import { generateEmailHookLink } from './hooks';
import type { ImapClient } from '../imap/client';
import { createDraft } from '../draft/service';
import { loadConfig, getAccount } from '../config';
import { loadSignature, embedSignatureImages, composeReply } from '../reply/composer';
import { homedir } from 'os';
import { join, dirname } from 'path';

/**
 * Interface for external service handlers
 */
export interface TuiHandlers {
  /** Create a reply draft using reply-email skill */
  createReplyDraft: (
    email: CleanInboxEmail,
    replyIntent: string,
    account: string
  ) => Promise<{ uid?: MessageUID; messageId: string }>;

  /** Create a todo in Tana using supertag CLI */
  createTanaTodo: (
    email: CleanInboxEmail,
    hookLink: string
  ) => Promise<{ nodeId: string }>;
}

/**
 * Options for the TUI
 */
export interface TuiOptions {
  /** Skip AI features (quick mode) */
  quick?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Prompt user for single character input
 */
async function promptKey(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${prompt}: `, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Prompt user for text input (reply intent, etc.)
 */
async function promptText(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${prompt}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Handle the reply action
 */
async function handleReply(
  rl: readline.Interface,
  session: CleanInboxSession,
  email: CleanInboxEmail,
  imapClient: ImapClient,
  handlers: TuiHandlers
): Promise<void> {
  // Prompt for reply intent
  const replyIntent = await promptText(rl, 'Reply intent (what do you want to say?)');

  if (!replyIntent) {
    console.log('Reply cancelled.');
    return;
  }

  console.log('Creating reply draft...');

  try {
    // Create draft via reply-email skill
    const draft = await handlers.createReplyDraft(email, replyIntent, session.account);

    // Create and record the action
    const action = createReplyAction(email, {
      draftUid: draft.uid,
      draftMessageId: draft.messageId,
      replyIntent,
      targetMailbox: 'Archive',
    });

    recordAction(session, action);

    // Execute: archive the original email
    await executeAction(imapClient, action);

    console.log(`✓ Draft created and original archived`);
  } catch (error) {
    console.error(`✗ Reply failed: ${error}`);
    // Don't advance - let user try again or choose different action
  }
}

/**
 * Handle the todo action
 */
async function handleTodo(
  rl: readline.Interface,
  session: CleanInboxSession,
  email: CleanInboxEmail,
  imapClient: ImapClient,
  handlers: TuiHandlers
): Promise<void> {
  // Generate hook link for the email
  const hookLink = generateEmailHookLink(email.messageId);

  console.log('Creating Tana todo...');

  try {
    // Create todo via supertag CLI
    const result = await handlers.createTanaTodo(email, hookLink);

    // Create and record the action
    const action = createTodoAction(email, {
      tanaNodeId: result.nodeId,
      todoDescription: email.subject,
      targetMailbox: 'Archive',
    });

    recordAction(session, action);

    // Execute: archive the original email
    await executeAction(imapClient, action);

    console.log(`✓ Todo created and email archived`);
  } catch (error) {
    console.error(`✗ Todo creation failed: ${error}`);
    // Don't advance - let user try again or choose different action
  }
}

/**
 * Run the clean inbox TUI
 *
 * @param session - Clean inbox session with emails loaded
 * @param imapClient - Connected IMAP client
 * @param handlers - External service handlers
 * @param options - TUI options
 */
export async function runTui(
  session: CleanInboxSession,
  imapClient: ImapClient,
  handlers: TuiHandlers,
  options: TuiOptions = {}
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\nClean Inbox: ${session.account}`);
  console.log(`Processing ${session.emails.length} emails\n`);

  let email = currentEmail(session);

  while (email) {
    // Display current email
    const view = formatEmailView(email, session.currentIndex + 1, session.emails.length);
    console.log(view);

    // Get user action
    const keyInput = await promptKey(rl, 'Action');
    const actionType = parseActionKey(keyInput);

    if (!actionType) {
      console.log('Invalid action. Press d/a/r/t/s/q');
      continue;
    }

    // Handle quit
    if (actionType === 'quit') {
      console.log('\nQuitting...');
      break;
    }

    // Handle each action type
    let actionHandled = false;

    switch (actionType) {
      case 'delete': {
        const action = createDeleteAction(email);
        recordAction(session, action);
        await executeAction(imapClient, action);
        console.log('✓ Deleted');
        actionHandled = true;
        break;
      }

      case 'archive': {
        const action = createArchiveAction(email, 'Archive');
        recordAction(session, action);
        await executeAction(imapClient, action);
        console.log('✓ Archived');
        actionHandled = true;
        break;
      }

      case 'skip': {
        const action = createSkipAction(email);
        recordAction(session, action);
        console.log('✓ Skipped');
        actionHandled = true;
        break;
      }

      case 'reply': {
        if (options.quick) {
          console.log('Reply disabled in quick mode.');
        } else {
          await handleReply(rl, session, email, imapClient, handlers);
          actionHandled = true;
        }
        break;
      }

      case 'todo': {
        if (options.quick) {
          console.log('Todo disabled in quick mode.');
        } else {
          await handleTodo(rl, session, email, imapClient, handlers);
          actionHandled = true;
        }
        break;
      }
    }

    // Advance to next email after successful action
    if (actionHandled) {
      email = nextEmail(session);
    }
  }

  // Show final stats
  console.log('\n' + formatSessionStats(session.stats));
  console.log('\n' + getSessionSummary(session));

  rl.close();
}

/**
 * Extract email address from "Name <email@addr>" format
 */
function extractEmailAddress(fromString: string): string {
  const match = fromString.match(/<([^>]+)>/);
  if (match) {
    return match[1];
  }
  // If no angle brackets, assume the whole string is the email
  return fromString.trim();
}

/**
 * Dynamically load the reply generator from reply-email skill
 */
async function loadReplyGenerator(): Promise<{
  generateReply: (options: {
    email: { uid: number; from: string; to: string[]; subject: string; date: Date; body: string; messageId: string };
    userInstructions: string;
    piiProtection?: boolean;
    verbose?: boolean;
  }) => Promise<{ reply: string; entitiesProtected?: number }>;
}> {
  const replyGeneratorPath = process.env.EMAIL_REPLY_GENERATOR;
  if (!replyGeneratorPath) {
    throw new Error('Set EMAIL_REPLY_GENERATOR to the path of a reply generator module');
  }
  return import(replyGeneratorPath);
}

/**
 * Create default handlers using internal services
 */
export function createDefaultHandlers(accountName: string): TuiHandlers {
  return {
    createReplyDraft: async (email, replyIntent, account) => {
      // Load config to get account details
      const config = loadConfig();
      const emailAccount = getAccount(config, account);

      // Extract sender email address from "Name <email@addr>" format
      const senderEmail = extractEmailAddress(email.from);

      // Build reply subject (add Re: if not already present)
      const replySubject = email.subject.toLowerCase().startsWith('re:')
        ? email.subject
        : `Re: ${email.subject}`;

      // Generate AI-powered reply using the reply-email skill
      let replyBody = replyIntent;

      if (email.body) {
        try {
          const { generateReply } = await loadReplyGenerator();

          // Convert CleanInboxEmail to FetchedEmail format for the generator
          const fetchedEmail = {
            uid: email.uid as number,
            from: email.from,
            to: email.to,
            subject: email.subject,
            date: email.date,
            body: email.body,
            messageId: email.messageId,
          };

          console.log('Generating AI reply...');
          const result = await generateReply({
            email: fetchedEmail,
            userInstructions: replyIntent,
            piiProtection: true,
            verbose: false,
          });

          replyBody = result.reply;
          if (result.entitiesProtected && result.entitiesProtected > 0) {
            console.log(`  (${result.entitiesProtected} PII entities protected)`);
          }
        } catch (error) {
          console.error(`  AI generation failed: ${error instanceof Error ? error.message : error}`);
          console.log('  Falling back to raw intent...');
          // Fall back to raw intent if AI generation fails
        }
      } else {
        console.log('  No email body available, using raw intent...');
      }

      // Load signature for this account
      let signature = await loadSignature(account, emailAccount.signature);

      // If signature loaded, embed any images
      if (signature && emailAccount.signature?.path) {
        const sigDir = dirname(emailAccount.signature.path);
        const embedded = await embedSignatureImages(signature.html, sigDir);
        signature = {
          ...signature,
          html: embedded.html,
          attachments: embedded.attachments,
        };
      }

      // Compose the full reply with signature and quoted original
      const composed = await composeReply({
        replyText: replyBody,
        originalEmail: {
          from: email.from,
          date: email.date,
          body: email.body || '',
          htmlBody: undefined, // CleanInboxEmail doesn't have htmlBody
        },
        signature: signature || undefined,
        maxQuoteLength: config.quoting?.maxQuoteLength || 102400,
      });

      // Create draft using the draft service with composed HTML
      const result = await createDraft(
        {
          to: [senderEmail],
          subject: replySubject,
          body: composed.plainText,
          html: composed.html,
          cidAttachments: composed.attachments.map(att => ({
            cid: att.cid,
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          })),
          inReplyTo: email.messageId,
          references: [email.messageId],
        },
        emailAccount
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create draft');
      }

      return {
        uid: result.uid,
        messageId: result.messageId,
      };
    },

    createTanaTodo: async (email, hookLink) => {
      // Call supertag CLI via shell
      const { $ } = await import('bun');

      // Create todo with email subject as name and hook link as clickable URL child
      // Pass JSON format with dataType: 'url' to make the link clickable in Tana
      const childJson = JSON.stringify({ name: hookLink, dataType: 'url' });
      const result = await $`supertag create todo ${email.subject} --children ${childJson}`.text();

      // Check if creation succeeded
      if (!result.includes('created successfully')) {
        throw new Error(`Failed to create todo: ${result}`);
      }

      return {
        nodeId: 'created', // supertag CLI doesn't return node ID
      };
    },
  };
}
