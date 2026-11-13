#!/usr/bin/env bash
# Build script for email skill
# Builds both CLI and MCP server

set -e

echo "Building email skill..."

# Build CLI wrapper
bun run scripts/build.ts

# Build MCP server wrapper
bun run scripts/build-mcp.ts

echo ""
echo "Build complete!"
echo "  - ./email      (CLI)"
echo "  - ./email-mcp  (MCP server)"
