/**
 * File logger for the email CLI
 *
 * Usage:
 *   import { createLogger } from './logger';
 *   const logger = createLogger('service-name');
 *   logger.info('Message here');
 *   logger.error('Error occurred', error);
 *
 * Logs are written to $EMAIL_LOG_DIR (default ~/.pai/logs)/{service-name}.log
 * Format: YYYY-MM-DDTHH:MM:SSZ [service-name] LEVEL: message
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_DIR = process.env.EMAIL_LOG_DIR || join(homedir(), '.pai', 'logs');

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export class Logger {
  private serviceName: string;
  private logFile: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.logFile = join(LOG_DIR, `${serviceName}.log`);

    // Ensure log directory exists
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | any): void {
    let fullMessage = message;

    if (error) {
      if (error instanceof Error) {
        fullMessage += ` - ${error.message}`;
        if (error.stack) {
          fullMessage += `\n${error.stack}`;
        }
      } else if (typeof error === 'object') {
        fullMessage += ` - ${JSON.stringify(error)}`;
      } else {
        fullMessage += ` - ${error}`;
      }
    }

    this.log('ERROR', fullMessage);
  }

  /**
   * Write log entry to file
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    let logLine = `${timestamp} [${this.serviceName}] ${level}: ${message}`;

    // Append data if provided
    if (data !== undefined) {
      if (typeof data === 'object') {
        logLine += ` ${JSON.stringify(data)}`;
      } else {
        logLine += ` ${data}`;
      }
    }

    logLine += '\n';

    try {
      appendFileSync(this.logFile, logLine, 'utf-8');
    } catch (err) {
      // If logging fails, write to stderr as fallback
      console.error(`Failed to write to log file ${this.logFile}:`, err);
      console.error(logLine);
    }
  }

  /**
   * Get the log file path
   */
  getLogFile(): string {
    return this.logFile;
  }
}

/**
 * Create a logger instance for a service
 */
export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName);
}
