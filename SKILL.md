---
name: email
description: Email client with multi-account IMAP/SMTP support, semantic search, and AI-powered digest generation. USE WHEN user wants to send email, read email, search email, email digest, sync emails, or any email management task.
triggers:
  - pattern: "/email"
    type: command
    priority: 100
  - pattern: "send email"
    type: keyword
    priority: 50
  - pattern: "read email"
    type: keyword
    priority: 50
  - pattern: "search email"
    type: keyword
    priority: 50
  - pattern: "email digest"
    type: keyword
    priority: 50
  - pattern: "sync emails"
    type: keyword
    priority: 40
---

# Email Skill

Multi-account email client with IMAP sync, SMTP sending, semantic search, and AI-powered features.

## Features

### Email Sending
- Multiple SMTP accounts
- Markdown → HTML rendering
- File attachments
- CC and BCC support

### Email Reading & Management
- Multi-account IMAP sync (INBOX, Archive, Sent)
- Incremental sync with UID tracking
- Smart filtering with priority detection
- Batch operations (archive, delete, label)
- Email digest generation

### Semantic Search
- Vector embeddings via resona library (LanceDB backend)
- Natural language search queries
- Uses `bge-m3` model via Ollama

## Quick Reference

**CLI entry point:** `bun run src/index.ts` (from skill directory)

### Send Email

```bash
# Basic send
email send -t "user@example.com" -s "Subject" -b "Body text"

# Multiple recipients — COMMA-SEPARATED, not multiple --to flags
email send -t "alice@example.com,bob@example.com" -s "Subject" -b "Body"

# With attachment — use --attachment, NOT --file
email send -t "user@example.com" -s "Subject" -b "Body" --attachment /path/to/file.pdf

# Multiple attachments
email send -t "user@example.com" -s "Subject" -b "Body" --attachment /path/a.pdf /path/b.pdf

# Read body from file (--file reads BODY from file, does NOT attach it)
email send -t "user@example.com" -s "Subject" --file /path/to/body.md

# With CC/BCC (also comma-separated)
email send -t "user@example.com" --cc "cc@example.com" -s "Subject" -b "Body"

# Specific account (default: config default)
email send -t "user@example.com" -s "Subject" -b "Body" -a kai

# Verbose mode (shows full send details)
email send -t "user@example.com" -s "Subject" -b "Body" -v
```

**CRITICAL: Common mistakes to avoid:**
- `--file` = read email BODY from a file (e.g., markdown). It does NOT attach the file.
- `--attachment` = attach a file to the email. This is what you want for PDFs, images, etc.
- Multiple `--to` flags do NOT work. Use comma-separated: `--to "a@x.com,b@x.com"`
- Body is auto-rendered as markdown→HTML unless `--no-markdown` is passed.

### Draft Email

```bash
# Create draft (saved to IMAP Drafts folder, not sent)
email draft create -t "user@example.com" -s "Subject" -b "Body"
# Same flags as send: --attachment, --file, --cc, --bcc, -a
```

### Sync & Read

```bash
# Sync emails
email sync -a <account>

# Search emails (semantic)
email embed search "meeting notes from last week"

# View email by ID
email show "<messageId>"

# Generate embeddings
email embed generate -a <account>
```

## MCP Server

Available as MCP server with tools:
- `email_search` - Search emails
- `email_semantic_search` - AI-powered semantic search
- `email_list` - List emails
- `email_get` - Get full email
- `email_send` - Send email
- `email_stats` - Email statistics

## Configuration

Config stored at `~/.config/email/config.json` with per-account SMTP/IMAP settings.
