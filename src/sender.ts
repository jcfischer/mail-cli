/**
 * Email Sender
 * Handles SMTP email sending via nodemailer
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailAccount, SendEmailOptions, SendResult } from './types';
import { markdownToHtml, isMarkdown } from './markdown';

/**
 * Create SMTP transporter from account configuration
 */
function createTransporter(account: EmailAccount): Transporter {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.smtp.auth.user,
      pass: account.smtp.auth.pass,
    },
  });
}

/**
 * Send email via SMTP
 */
export async function sendEmail(
  account: EmailAccount,
  options: SendEmailOptions
): Promise<SendResult> {
  try {
    const transporter = createTransporter(account);

    // Determine if body is markdown
    const isMarkdownContent = options.markdown !== false && isMarkdown(options.body);

    // Prepare email content
    const mailOptions: any = {
      from: {
        name: account.from.name,
        address: account.from.email,
      },
      to: options.to,
      subject: options.subject,
    };

    // Add CC and BCC if provided
    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    // Set body content (text and/or HTML)
    if (isMarkdownContent) {
      mailOptions.text = options.body; // Plain text fallback
      mailOptions.html = markdownToHtml(options.body);
    } else {
      mailOptions.text = options.body;
    }

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments;
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      account: account.name,
      from: account.from.email,
      to: options.to,
      subject: options.subject,
    };
  } catch (error) {
    return {
      success: false,
      account: account.name,
      from: account.from.email,
      to: options.to,
      subject: options.subject,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Verify SMTP connection
 */
export async function verifyConnection(account: EmailAccount): Promise<boolean> {
  try {
    const transporter = createTransporter(account);
    await transporter.verify();
    return true;
  } catch (error) {
    return false;
  }
}
