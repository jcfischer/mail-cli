#!/usr/bin/env bun
/**
 * Build script for email CLI
 * Creates a simple wrapper that loads the main module
 */

import { writeFileSync, chmodSync } from "fs";
import { join } from "path";

const projectDir = join(import.meta.dir, "..");
const outputPath = join(projectDir, "email");

// Simple wrapper that loads the main module
const wrapper = `#!/usr/bin/env bun
/**
 * Email CLI
 */
await import("./src/index.ts");
`;

writeFileSync(outputPath, wrapper);
chmodSync(outputPath, 0o755);

console.log("Built: email");
console.log("  - Using LanceDB for vector embeddings");
