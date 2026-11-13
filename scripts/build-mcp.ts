#!/usr/bin/env bun
/**
 * Build script for email-mcp
 * Creates a simple wrapper that loads the MCP server module
 */

import { writeFileSync, chmodSync } from "fs";
import { join } from "path";

const projectDir = join(import.meta.dir, "..");
const outputPath = join(projectDir, "email-mcp");

// Simple wrapper that loads the MCP server module
const wrapper = `#!/usr/bin/env bun
/**
 * Email MCP Server - Model Context Protocol server for Email
 */
await import("./src/mcp/index.ts");
`;

writeFileSync(outputPath, wrapper);
chmodSync(outputPath, 0o755);

console.log("Built: email-mcp");
console.log("  - MCP server for email search, send, and analytics");
