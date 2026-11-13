# Email Skill Security Best Practices

## Overview

The email skill handles sensitive credentials (SMTP and IMAP passwords). This document outlines security best practices for protecting your email credentials.

## Security Features

### 1. Automatic File Permissions

The email skill automatically enforces secure file permissions:

- **Config file** (`~/.config/email/config.json`): Set to `600` (owner read/write only)
- **Database** (`~/.config/email/email.db`): Set to `600` (owner read/write only)

When you run any email command, the skill will:
1. Check file permissions
2. Display a warning if permissions are insecure
3. Automatically fix permissions to `600`

### 2. Credential Storage Options

The email skill supports three methods for storing passwords:

#### Option 1: macOS Keychain (Recommended)

Store passwords securely in the macOS keychain:

```bash
# Store SMTP password in keychain
email keychain-set -s "email-personal-smtp" -p "your-app-password"

# Store IMAP password in keychain
email keychain-set -s "email-personal-imap" -p "your-app-password"
```

Then update your `~/.config/email/config.json`:

```json
{
  "accounts": {
    "personal": {
      "smtp": {
        "auth": {
          "pass": "keychain:email-personal-smtp"
        }
      },
      "imap": {
        "auth": {
          "pass": "keychain:email-personal-imap"
        }
      }
    }
  }
}
```

**Benefits:**
- Passwords stored in OS-native secure storage
- Encrypted at rest
- Not accessible to other users
- Can be managed via macOS Keychain Access app

#### Option 2: Environment Variables

Store passwords in environment variables:

```bash
# Add to your ~/.zshrc or ~/.bashrc
export EMAIL_PERSONAL_PASSWORD="your-app-password"
export EMAIL_WORK_PASSWORD="your-work-password"
```

Then update your config:

```json
{
  "accounts": {
    "personal": {
      "smtp": {
        "auth": {
          "pass": "env:EMAIL_PERSONAL_PASSWORD"
        }
      }
    }
  }
}
```

**Benefits:**
- Passwords not stored in config file
- Can be set per-shell session
- Easy to rotate

**Drawbacks:**
- Less secure than keychain
- Visible in process environment
- Must be set in every shell session

#### Option 3: Plain Text (Not Recommended)

Store passwords directly in config file:

```json
{
  "accounts": {
    "personal": {
      "smtp": {
        "auth": {
          "pass": "your-actual-password"
        }
      }
    }
  }
}
```

**⚠️ Warning:** Plain text passwords are NOT secure. Only use this for:
- Testing/development
- Temporary setups
- Non-sensitive accounts

**If you must use plain text:**
1. Ensure config file has `600` permissions (automatic)
2. Never commit config file to git
3. Use app-specific passwords, not account passwords
4. Rotate passwords regularly

### 3. Security Check Command

Run a security audit of your email configuration:

```bash
email security-check
```

This command will:
1. Check file permissions on config and database
2. Scan for plain-text passwords
3. Display security warnings and recommendations
4. Provide instructions for fixing issues

**Example output:**

```
🔒 Checking email security...

✓  Config file permissions: secure (600)
✓  Database permissions: secure (600)

⚠️  Security warnings:

   Account "personal": SMTP password stored in plain text. Consider using keychain: or env: prefix.

📖 Security best practices:
   1. Store passwords in macOS keychain instead of config file:
      security add-generic-password -s "email-personal-smtp" -a "$USER" -w "your-password"
      Then use: "pass": "keychain:email-personal-smtp"

   2. Use environment variables:
      export EMAIL_PERSONAL_PASSWORD="your-password"
      Then use: "pass": "env:EMAIL_PERSONAL_PASSWORD"
```

## Multi-Account Security

When managing multiple email accounts (e.g., personal and work):

### Account Isolation

The email skill stores all accounts in a single database by default. Each email record includes:
- `account` field (e.g., "personal", "work")
- `mailbox` field (e.g., "INBOX", "Archive", "Sent")

This allows:
- ✅ Unified search across accounts
- ✅ Cross-account linking to knowledge base
- ✅ Efficient storage

### Work Account Best Practices

For work accounts, consider:

1. **Use separate keychain entries:**
   ```bash
   email keychain-set -s "email-work-smtp" -p "work-password"
   email keychain-set -s "email-work-imap" -p "work-password"
   ```

2. **Filter by account in searches:**
   ```bash
   email search "budget" -a work    # Only search work emails
   email search "vacation" -a personal  # Only search personal emails
   ```

3. **Separate sync schedules:**
   ```bash
   email sync -a personal   # Sync personal only
   email sync -a work       # Sync work only
   ```

4. **Account removal:**
   If you leave a company, remove work account data:
   ```bash
   # Reset sync state
   email sync-reset -a work

   # Delete work emails from database
   sqlite3 ~/.config/email/email.db "DELETE FROM emails WHERE account = 'work'"

   # Remove from config
   # Edit ~/.config/email/config.json and remove work account
   ```

## Credential Rotation

Rotate email passwords periodically:

1. **Update password in provider** (Gmail, Outlook, etc.)

2. **Update keychain:**
   ```bash
   # Delete old entry
   security delete-generic-password -s "email-personal-smtp"

   # Add new entry
   email keychain-set -s "email-personal-smtp" -p "new-password"
   ```

3. **Verify connection:**
   ```bash
   email verify -a personal
   ```

## App-Specific Passwords

For Gmail and other providers with 2FA:

1. **Enable 2-factor authentication** on your Google account

2. **Generate app-specific password:**
   - Gmail: https://myaccount.google.com/apppasswords
   - Outlook: https://account.live.com/proofs/AppPassword

3. **Use app password in config** (not your account password)

## Privacy Considerations

### What's Stored Locally

The email skill stores:
- ✅ Email metadata (subject, sender, date, snippet)
- ✅ Flags (read, starred, archived)
- ✅ Priority scores
- ❌ **NOT** full email bodies (only 200-char snippets)
- ❌ **NOT** attachments

This keeps the database small and protects sensitive content.

### Database Location

- **Database:** `~/.config/email/email.db` (permissions: 600)
- **Config:** `~/.config/email/config.json` (permissions: 600)

Both are stored locally and never transmitted to external services.

### Backups

If you backup your home directory, ensure:
1. Backups are encrypted
2. Config file with plain-text passwords is excluded
3. Use keychain-based passwords for better backup security

## macOS Keychain Manual Management

You can also manage keychain entries manually:

### Add password:
```bash
security add-generic-password -s "email-personal-smtp" -a "$USER" -w "your-password"
```

### Retrieve password:
```bash
security find-generic-password -s "email-personal-smtp" -w
```

### Update password:
```bash
security add-generic-password -s "email-personal-smtp" -a "$USER" -w "new-password" -U
```

### Delete password:
```bash
security delete-generic-password -s "email-personal-smtp"
```

### View in Keychain Access app:
1. Open "Keychain Access" app (Applications > Utilities)
2. Search for "email-personal-smtp"
3. Double-click to view/edit

## Quick Reference

| Task | Command |
|------|---------|
| Store password in keychain | `email keychain-set -s "service-name" -p "password"` |
| Run security check | `email security-check` |
| Check file permissions | `ls -la ~/.config/email/` |
| Fix permissions manually | `chmod 600 ~/.config/email/config.json` |
| Verify SMTP connection | `email verify -a personal` |
| Remove account data | `email sync-reset -a work` + delete from config |

## Security Checklist

Before using the email skill in production:

- [ ] Config file permissions are `600`
- [ ] Passwords stored in keychain (not plain text)
- [ ] App-specific passwords used (not account passwords)
- [ ] 2FA enabled on email accounts
- [ ] `email security-check` shows no warnings
- [ ] Config file excluded from git (`.gitignore`)
- [ ] Backups are encrypted
- [ ] Regular password rotation scheduled

## Getting Help

If you encounter security issues:

1. Run `email security-check` for diagnostics
2. Check file permissions: `ls -la ~/.config/email/`
3. Verify keychain entries: `security find-generic-password -s "service-name"`
4. Review logs for authentication errors

---

**Last updated:** 2025-12-05
**Version:** 1.0.0
