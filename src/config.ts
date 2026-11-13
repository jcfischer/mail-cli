/**
 * Email Configuration Manager
 * Loads config from ~/.config/email/config.json or environment variables
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { EmailConfig, EmailAccount } from './types';
import { enforceSecurePermissions, validateConfigSecurity, displaySecurityRecommendations, resolvePassword } from './security';

const CONFIG_DIR = join(homedir(), '.config', 'email');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const SIGNATURES_DIR = join(CONFIG_DIR, 'signatures');

/**
 * Load email configuration with security checks
 */
export function loadConfig(): EmailConfig {
  // Try to load from config file
  if (existsSync(CONFIG_FILE)) {
    try {
      // Enforce secure file permissions (chmod 600)
      enforceSecurePermissions(CONFIG_FILE);

      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content) as EmailConfig;

      // Validate config security and display warnings
      const warnings = validateConfigSecurity(config);
      if (warnings.length > 0) {
        displaySecurityRecommendations(warnings);
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to parse config file: ${error}`);
    }
  }

  // No config file found
  throw new Error(
    `Email configuration not found. Please create ${CONFIG_FILE}\n` +
    `See docs/config-example.json for configuration structure.`
  );
}

/**
 * Get account configuration with resolved passwords
 * Performs case-insensitive account name lookup
 */
export function getAccount(config: EmailConfig, accountName?: string): EmailAccount {
  const name = accountName || config.defaultAccount;

  // Case-insensitive lookup: find the actual key that matches
  const actualKey = Object.keys(config.accounts).find(
    key => key.toLowerCase() === name.toLowerCase()
  );

  const account = actualKey ? config.accounts[actualKey] : undefined;
  if (!account) {
    const available = Object.keys(config.accounts).join(', ');
    throw new Error(
      `Account "${name}" not found in configuration.\n` +
      `Available accounts: ${available}`
    );
  }

  // Resolve passwords from keychain/env if needed
  const resolvedAccount = { ...account };

  if (resolvedAccount.smtp?.auth?.pass) {
    resolvedAccount.smtp.auth.pass = resolvePassword(resolvedAccount.smtp.auth.pass);
  }

  if (resolvedAccount.imap?.auth?.pass) {
    resolvedAccount.imap.auth.pass = resolvePassword(resolvedAccount.imap.auth.pass);
  }

  return resolvedAccount;
}

/**
 * List all configured accounts
 */
export function listAccounts(config: EmailConfig): string[] {
  return Object.keys(config.accounts);
}

/**
 * Get default account name
 */
export function getDefaultAccount(config: EmailConfig): string {
  return config.defaultAccount;
}

/**
 * Validate signature path is within allowed directory
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 */
export function validateSignaturePath(path: string): boolean {
  const resolvedPath = resolve(path);

  // Only allow paths within these specific directories
  const allowedDirs = [
    SIGNATURES_DIR,
    CONFIG_DIR,
  ];

  // Check if resolved path is within any allowed directory
  // AND the resolved path doesn't escape to a parent directory
  const isInAllowedDir = allowedDirs.some(dir => resolvedPath.startsWith(dir + '/') || resolvedPath === dir);

  // Also verify path doesn't traverse out of home directory
  const homeDir = homedir();
  const isInHome = resolvedPath.startsWith(homeDir + '/') || resolvedPath === homeDir;

  return isInAllowedDir && isInHome;
}

/**
 * Get the signatures directory path
 */
export function getSignaturesDir(): string {
  return SIGNATURES_DIR;
}
