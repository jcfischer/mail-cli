/**
 * Central version management
 *
 * Single source of truth for version across all tools
 */

import packageJson from '../package.json';

export const VERSION = packageJson.version;
