# mail-cli

Send emails via SMTP with multiple account support and automatic markdown rendering.

## Quick Start

```bash
# Build
cd mail-cli
bun install
bun run build

# Configure
mkdir -p ~/.config/email
cp docs/config-example.json ~/.config/email/config.json
# Edit config.json with your SMTP credentials

# Test
email verify
email accounts

# Send
email send -t user@example.com -s "Hello" -b "Test email"
```

## Features

### Email Sending
- ✅ Multiple SMTP accounts
- ✅ Markdown → HTML rendering
- ✅ File attachments
- ✅ CC and BCC support
- ✅ Stdin/file input
- ✅ Connection verification

### Email Reading & Management
- ✅ Multi-account IMAP sync (INBOX, Archive, Sent)
- ✅ Incremental sync with UID tracking
- ✅ Verbose progress indicator (--verbose flag)
- ✅ Smart filtering with priority detection
- ✅ Batch operations (archive, delete, label)
- ✅ Email digest generation

### Database & Analytics
- ✅ SQLite email indexing with multi-mailbox support
- ✅ Email statistics and trends (day/week/month)
- ✅ Sender analysis (excludes user's own emails)
- ✅ Priority distribution tracking
- ✅ Volume trend visualization
- ✅ Per-account, per-mailbox sync state

### Semantic Search (AI-powered)
- ✅ Vector embeddings via resona library
- ✅ Natural language search queries
- ✅ Per-account embedding databases
- ✅ Multi-account search with --all flag

### Technology
- ✅ TypeScript/Bun CLI
- ✅ Bun's native SQLite
- ✅ Drizzle ORM

## Usage

### Sending Emails

```bash
# Plain text
email send -t user@example.com -s "Subject" -b "Body text"

# Markdown
email send -t user@example.com -s "Report" -b "# Title\n\n**Bold** text"

# With attachment
email send -t user@example.com -s "Report" -b "See attached" --attachment report.pdf

# Multiple attachments
email send -t user@example.com -s "Files" -b "Documents attached" --attachment doc1.pdf --attachment doc2.xlsx

# From file
email send -t user@example.com -s "Report" -f report.md

# From stdin
echo "Content" | email send -t user@example.com -s "Subject"

# Specific account
email send -t user@example.com -s "Subject" -b "Body" -a work

# Multiple recipients
email send -t user1@example.com,user2@example.com --cc boss@example.com -s "Update" -b "Content"
```

### Drafts

```bash
# Save a draft to the account's Drafts mailbox (never sent)
./email draft create -t "user@example.com" -s "Subject" -b "Body"

# Save at most one draft per request ID, for callers that may retry
./email draft create -t "user@example.com" -s "Subject" -b "Body" \
  -a work --request-id req-42 -o json
# {"status":"created","id":"<message-id>","account":"work"}
# A repeat with the same content answers "exists"; other content answers
# "conflict". Neither saves a second draft.

# Find a draft by request ID (every IMAP account, or one with -a)
./email draft lookup req-42 -o json
# {"status":"found","id":"<message-id>","account":"work"}
# {"status":"not_found"}   no draft in Drafts carries this request ID (it was sent,
#                          removed, or re-saved by a client that dropped the header)
# {"status":"unavailable"} an account could not be reached
```

The request ID is stored on the draft as the `X-Mail-Request-Id` header, with a
content digest in `X-Mail-Request-Digest`. Lookup reads that header from every
message in Drafts rather than relying on the server to search custom headers.

"At most one" holds for sequential calls. Two creates with the same request ID
that overlap (for example, a retry sent while the first is still saving) can
both save a draft, because the check and the save are separate IMAP commands.

### Test mailbox

`scripts/test-mailbox` runs a disposable GreenMail IMAP/SMTP server in a
container (Docker or Rancher Desktop) with one invented account, for testing
the CLI without touching a real mailbox. Mail lives in memory and is gone after
`down`.

```bash
scripts/test-mailbox up          # start it, create Drafts, write a sandbox config
H="$(scripts/test-mailbox home)" # the sandbox home with that config

HOME="$H" ./email draft create -t to@example.invalid -s Test -b Body \
  --request-id req-1 -o json
HOME="$H" ./email draft lookup req-1 -o json
HOME="$H" ./email list -a test -m Drafts   # look into Drafts

scripts/test-mailbox down
```

Any IMAP client can also open it: `127.0.0.1:3143`, no TLS, user `test`,
password `secret`.

### Syncing Emails

```bash
# Sync all accounts (incremental)
email sync

# Sync specific account
email sync -a personal

# Sync with verbose progress indicator
email sync -a personal --verbose

# Force full resync (ignores last sync state)
email sync -a personal --full

# Sync specific mailboxes only
email sync -a personal -m INBOX Archive Sent

# Check sync status
email sync-status

# Reset sync state (forces full resync next time)
email sync-reset -a personal
```

### Reading & Managing Emails

```bash
# List recent emails
email list -a personal --limit 20

# List unread emails only
email list -a personal --unseen

# Get specific email
email get --uid 12345 -a personal

# Analyze email priorities
email filter -a personal

# Archive read emails older than 7 days
email batch-archive -a personal --older-than 7 --read-only --apply

# Delete promotional emails (dry-run first)
email batch-delete -a personal --keywords sale discount --dry-run

# Move newsletters to folder
email batch-label --to Newsletters --has-unsubscribe --apply
```

### Email Analytics

```bash
# Index emails to database
email index -a personal --since 30

# View email statistics
email stats -a personal --period week

# Detailed stats with sender analysis
email stats -a personal --senders --volume --priority
```

### Semantic Search (AI-powered)

```bash
# Configure embedding provider (show current settings)
email embed config

# Generate embeddings for indexed emails
email embed generate -a personal
email embed generate --all              # All accounts

# Semantic search with natural language
email embed search "project updates" -a personal
email embed search "budget planning" --all   # Search all accounts

# View embedding statistics
email embed stats -a personal
email embed stats --all                 # All accounts
```

### List Mailboxes

```bash
# List all available mailboxes/folders
email mailboxes -a personal

# JSON output
email mailboxes -a work --output json
```


## Configuration

Create `~/.config/email/config.json`:

```json
{
  "defaultAccount": "personal",
  "accounts": {
    "personal": {
      "name": "Personal",
      "from": {
        "name": "Your Name",
        "email": "you@example.com"
      },
      "smtp": {
        "host": "smtp.example.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "you@example.com",
          "pass": "your-password"
        }
      }
    }
  }
}
```

See [SKILL.md](./SKILL.md) for complete documentation.

## Documentation

- [SKILL.md](./SKILL.md) - Complete documentation
- [docs/config-example.json](./docs/config-example.json) - Configuration template

## Requirements

- Bun runtime
- SMTP server credentials
- macOS, Linux, or Windows

## License

MIT
