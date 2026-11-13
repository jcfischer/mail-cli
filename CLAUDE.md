# Email Skill - Claude Code Context

## Build Instructions

**IMPORTANT: After modifying any source files, rebuild the binary:**

```bash
bun run scripts/build.ts
```

This creates the `./email` executable wrapper that loads `src/index.ts`.

## Architecture

- **CLI Entry**: `src/index.ts` - Commander.js CLI with subcommands
- **Embedding**: Uses `resona` library (LanceDB-based vector storage)
- **Database**: Per-account SQLite for email index, per-account LanceDB for embeddings
- **Config**: `~/.config/email/config.json` for accounts and SMTP settings

## Key Commands

```bash
./email sync -a <account>           # Sync emails from Gmail
./email embed generate -a <account> # Generate embeddings
./email embed search "query"        # Semantic search (shows Message-ID for each result)
./email embed stats                 # Show embedding stats
./email show "<messageId>"          # View full email by Message-ID (fetches from IMAP)
./email send                        # Send email via SMTP
```

## MCP Server

```bash
bun run scripts/build-mcp.ts        # Build MCP server
./email-mcp                         # Run MCP server (for testing)
```

**MCP Tools:** `email_search`, `email_semantic_search`, `email_list`, `email_get`, `email_send`, `email_stats`

## Testing

```bash
bun test                            # Run all 288 tests
bun test test/db/                   # Embedding service tests only
bun test test/cli/                  # CLI tests only
bun test test/unit/                 # Unit tests (reply composer, config, etc.)
```

## Embedding Storage

- Embeddings stored in `~/.config/email/embeddings-<account>.lance/`
- Uses Ollama with `bge-m3` model (8k context, 1024 dimensions)
- Hash-based change detection skips unchanged emails
- **Native Chunking**: Automatically chunks long emails (18k chars per chunk, 500 char overlap)
- Embeds full email body with Subject/From metadata for optimal semantic search

## Dependencies

- `resona` - Vector embedding library (LanceDB backend)
- `googleapis` - Gmail API access
- `nodemailer` - SMTP email sending
- `commander` - CLI framework

## Common Tasks

| Task | Command |
|------|---------|
| Rebuild after changes | `bun run scripts/build.ts` |
| Build MCP server | `bun run scripts/build-mcp.ts` |
| Check embed status | `./email embed generate -a personal --limit 10` |
| Full re-embed | `./email embed generate -a personal --force` |
| Gradual re-embed | `./email embed generate -a personal --reembed --limit 100` |
| Reset re-embed progress | `./email embed generate -a personal --reembed-reset` |
| Run tests | `bun test` |

## Gradual Re-embedding

For upgrading existing embeddings to the new bge-m3 model without processing everything at once:

```bash
./email embed generate -a personal --reembed --limit 100  # Process 100 newest unprocessed
./email embed generate -a personal --reembed-reset        # Reset progress to start over
```

- Processes emails newest-to-oldest (most relevant first)
- Progress saved in `~/.config/email/reembed-state-<account>.json`
- Each run continues from where the last left off
- State auto-deletes when all emails are re-embedded

## Reply Composition & Signatures

The `email clean` command's reply feature now includes:
- **Quoted original**: Original email body with "On {date}, at {time}, {sender} wrote:" header
- **HTML signatures**: Configurable per-account signatures with inline image support
- **CID attachments**: Embedded images converted to CID references for email clients

### Signature Configuration

Add to your account config in `~/.config/email/config.json`:

```json
{
  "accounts": {
    "personal": {
      "signature": {
        "enabled": true,
        "path": "~/.config/email/signatures/personal.html",
        "textPath": "~/.config/email/signatures/personal.txt"
      }
    }
  },
  "quoting": {
    "maxQuoteLength": 102400
  }
}
```

### Signature File Format

Create signature files in `~/.config/email/signatures/`:

```html
<!-- personal.html -->
<p>Best regards,<br>
<strong>John Doe</strong><br>
<img src="file:///Users/you/.config/email/signatures/logo.png" alt="Logo"></p>
```

Images with `file://` URLs are automatically embedded as CID attachments.
