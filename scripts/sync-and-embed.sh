#!/bin/bash
# Email Sync and Embed Script
# Syncs emails from IMAP and generates embeddings for semantic search
#
# Usage: ./sync-and-embed.sh [--account <name>] [--no-embed]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL_CLI="$SCRIPT_DIR/../email"
LOG_PREFIX="[email-sync]"

# Parse arguments
ACCOUNT=""
NO_EMBED=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -a|--account)
            ACCOUNT="$2"
            shift 2
            ;;
        --no-embed)
            NO_EMBED=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "$LOG_PREFIX Starting email sync at $(date)"

# Sync emails
if [[ -n "$ACCOUNT" ]]; then
    echo "$LOG_PREFIX Syncing account: $ACCOUNT"
    "$EMAIL_CLI" sync -a "$ACCOUNT"
else
    echo "$LOG_PREFIX Syncing all accounts..."
    "$EMAIL_CLI" sync -a personal || echo "$LOG_PREFIX Warning: personal sync failed"
    "$EMAIL_CLI" sync -a work || echo "$LOG_PREFIX Warning: work sync failed"
fi

# Generate embeddings (unless --no-embed)
if [[ "$NO_EMBED" == "false" ]]; then
    echo ""
    echo "$LOG_PREFIX Generating embeddings..."
    if [[ -n "$ACCOUNT" ]]; then
        "$EMAIL_CLI" embed generate -a "$ACCOUNT" --limit 100
    else
        "$EMAIL_CLI" embed generate -a personal --limit 100 || echo "$LOG_PREFIX Warning: personal embed failed"
        "$EMAIL_CLI" embed generate -a work --limit 100 || echo "$LOG_PREFIX Warning: work embed failed"
    fi
fi

echo ""
echo "$LOG_PREFIX Completed at $(date)"
