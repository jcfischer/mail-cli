/**
 * Security utilities for email skill
 * Handles file permissions and credential validation
 */

import { statSync, chmodSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'email');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DB_PATH = join(homedir(), '.config', 'email', 'email.db');

/**
 * Check and enforce secure file permissions (chmod 600)
 * Returns true if permissions are secure, false if they were fixed
 */
export function enforceSecurePermissions(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return true; // File doesn't exist yet
  }

  try {
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777; // Get permission bits

    // Check if file is readable/writable only by owner (0o600)
    if (mode !== 0o600) {
      console.warn(`⚠️  Insecure permissions on ${filePath} (${mode.toString(8)})`);
      console.warn('   Setting to 600 (owner read/write only)...');

      chmodSync(filePath, 0o600);
      console.log(`✓  Fixed permissions on ${filePath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Failed to check permissions on ${filePath}:`, error);
    return false;
  }
}

/**
 * Validate config file security
 * Checks for insecure credential storage
 */
export function validateConfigSecurity(config: any): string[] {
  const warnings: string[] = [];

  // Check if passwords are stored in plain text
  for (const [accountName, account] of Object.entries(config.accounts || {})) {
    const acc = account as any;

    // Check SMTP password
    if (acc.smtp?.auth?.pass) {
      const pass = acc.smtp.auth.pass;

      // Warn if password looks like plain text (not a keychain reference)
      if (!pass.startsWith('keychain:') && !pass.startsWith('env:')) {
        warnings.push(
          `Account "${accountName}": SMTP password stored in plain text. ` +
          `Consider using keychain: or env: prefix.`
        );
      }
    }

    // Check IMAP password
    if (acc.imap?.auth?.pass) {
      const pass = acc.imap.auth.pass;

      if (!pass.startsWith('keychain:') && !pass.startsWith('env:')) {
        warnings.push(
          `Account "${accountName}": IMAP password stored in plain text. ` +
          `Consider using keychain: or env: prefix.`
        );
      }
    }
  }

  return warnings;
}

/**
 * Resolve password from various sources
 * Supports:
 * - Plain text: "mypassword"
 * - Keychain: "keychain:email-personal-smtp"
 * - Environment: "env:EMAIL_PERSONAL_PASSWORD"
 */
export function resolvePassword(password: string): string {
  if (!password) {
    throw new Error('Password is required');
  }

  // Keychain reference: keychain:service-name
  if (password.startsWith('keychain:')) {
    const serviceName = password.slice('keychain:'.length);
    return getKeychainPassword(serviceName);
  }

  // Environment variable: env:VAR_NAME
  if (password.startsWith('env:')) {
    const varName = password.slice('env:'.length);
    const envPassword = process.env[varName];

    if (!envPassword) {
      throw new Error(`Environment variable ${varName} not set`);
    }

    return envPassword;
  }

  // Plain text password (not recommended)
  return password;
}

/**
 * Get password from macOS keychain using security command
 */
function getKeychainPassword(serviceName: string): string {
  try {
    const { execSync } = require('child_process');

    // Use macOS security command to retrieve password
    const command = `security find-generic-password -s "${serviceName}" -w`;
    const password = execSync(command, { encoding: 'utf-8' }).trim();

    return password;
  } catch (error: any) {
    if (error.message?.includes('could not be found')) {
      throw new Error(
        `Keychain item "${serviceName}" not found. ` +
        `Create it with: security add-generic-password -s "${serviceName}" -a "${process.env.USER}" -w`
      );
    }

    throw new Error(`Failed to retrieve keychain password "${serviceName}": ${error.message}`);
  }
}

/**
 * Store password in macOS keychain
 */
export function storeKeychainPassword(serviceName: string, password: string, account?: string): void {
  try {
    const { execSync } = require('child_process');

    const accountArg = account || process.env.USER || 'user';
    const command = `security add-generic-password -s "${serviceName}" -a "${accountArg}" -w "${password}" -U`;

    execSync(command, { encoding: 'utf-8' });
    console.log(`✓  Stored password in keychain: ${serviceName}`);
  } catch (error: any) {
    throw new Error(`Failed to store keychain password "${serviceName}": ${error.message}`);
  }
}

/**
 * Initialize security for email skill
 * Checks and fixes file permissions, validates config
 */
export function initializeSecurity(): void {
  console.log('🔒 Checking email security...\n');

  // Enforce secure permissions on config file
  if (existsSync(CONFIG_FILE)) {
    const wasSecure = enforceSecurePermissions(CONFIG_FILE);
    if (wasSecure) {
      console.log(`✓  Config file permissions: secure (600)`);
    }
  }

  // Enforce secure permissions on database
  if (existsSync(DB_PATH)) {
    const wasSecure = enforceSecurePermissions(DB_PATH);
    if (wasSecure) {
      console.log(`✓  Database permissions: secure (600)`);
    }
  }

  console.log('');
}

/**
 * Display security recommendations
 */
export function displaySecurityRecommendations(warnings: string[]): void {
  if (warnings.length === 0) {
    return;
  }

  console.log('\n⚠️  Security warnings:\n');

  for (const warning of warnings) {
    console.log(`   ${warning}`);
  }

  console.log('\n📖 Security best practices:');
  console.log('   1. Store passwords in macOS keychain instead of config file:');
  console.log('      security add-generic-password -s "email-personal-smtp" -a "$USER" -w "your-password"');
  console.log('      Then use: "pass": "keychain:email-personal-smtp"');
  console.log('');
  console.log('   2. Use environment variables:');
  console.log('      export EMAIL_PERSONAL_PASSWORD="your-password"');
  console.log('      Then use: "pass": "env:EMAIL_PERSONAL_PASSWORD"');
  console.log('');
  console.log('   3. Ensure config file has secure permissions:');
  console.log('      chmod 600 ~/.config/email/config.json');
  console.log('');
}
