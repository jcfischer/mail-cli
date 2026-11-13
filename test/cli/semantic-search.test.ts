/**
 * Embed Command Tests
 * TDD: Testing embed config, generate, search, stats subcommands
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Test directory for temporary databases
let TEST_DIR: string;

describe("embed command", () => {
  describe("basic functionality", () => {
    it("should show help for embed command", async () => {
      const result = await $`bun ./src/index.ts embed --help`.text();

      expect(result).toContain("embed");
      expect(result).toContain("Manage vector embeddings for semantic search");
      expect(result).toContain("config");
      expect(result).toContain("generate");
      expect(result).toContain("search");
      expect(result).toContain("stats");
    });
  });
});

describe("embed config command", () => {
  describe("basic functionality", () => {
    it("should show help for embed config command", async () => {
      const result = await $`bun ./src/index.ts embed config --help`.text();

      expect(result).toContain("config");
      expect(result).toContain("Configure embedding provider and model");
      expect(result).toContain("--show");
    });
  });
});

describe("embed generate command", () => {
  describe("basic functionality", () => {
    it("should show help for embed generate command", async () => {
      const result = await $`bun ./src/index.ts embed generate --help`.text();

      expect(result).toContain("generate");
      expect(result).toContain("Generate embeddings for indexed emails");
      expect(result).toContain("--account");
      expect(result).toContain("--all");
      expect(result).toContain("--limit");
      expect(result).toContain("--force");
    });
  });
});

describe("embed search command", () => {
  describe("basic functionality", () => {
    it("should show help for embed search command", async () => {
      const result = await $`bun ./src/index.ts embed search --help`.text();

      expect(result).toContain("search");
      expect(result).toContain("Semantic search across embedded emails");
      expect(result).toContain("--account");
      expect(result).toContain("--all");
      expect(result).toContain("--limit");
      expect(result).toContain("--output");
    });

    it("should require a query argument", async () => {
      try {
        await $`bun ./src/index.ts embed search 2>&1`.text();
        // If we get here without error, the test should fail
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        // Commander exits with error when missing required arg
        // The error may be in stderr or stdout depending on how bun captures it
        const stderrStr = e.stderr?.toString?.() || "";
        const stdoutStr = e.stdout?.toString?.() || "";
        const messageStr = e.message?.toString?.() || "";
        const output = stderrStr + stdoutStr + messageStr;
        expect(output).toContain("missing required argument");
      }
    });

    it("should have default limit of 10", async () => {
      const helpResult = await $`bun ./src/index.ts embed search --help`.text();

      expect(helpResult).toContain("default: 10");
    });
  });

  describe("output formats", () => {
    it("should support text and json output formats", async () => {
      const helpResult = await $`bun ./src/index.ts embed search --help`.text();

      expect(helpResult).toContain("--output");
      expect(helpResult).toContain("text");
      expect(helpResult).toContain("json");
    });
  });

});

describe("email show command", () => {
  describe("basic functionality", () => {
    it("should show help for show command", async () => {
      const result = await $`bun ./src/index.ts show --help`.text();

      expect(result).toContain("show");
      expect(result).toContain("View full email by message ID");
      expect(result).toContain("--account");
    });

    it("should require a messageId argument", async () => {
      try {
        await $`bun ./src/index.ts show 2>&1`.text();
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        const stderrStr = e.stderr?.toString?.() || "";
        const stdoutStr = e.stdout?.toString?.() || "";
        const messageStr = e.message?.toString?.() || "";
        const output = stderrStr + stdoutStr + messageStr;
        expect(output).toContain("missing required argument");
      }
    });

    it("should support --html flag for HTML output", async () => {
      const helpResult = await $`bun ./src/index.ts show --help`.text();

      expect(helpResult).toContain("--html");
    });

    it("should support --mark-read flag", async () => {
      const helpResult = await $`bun ./src/index.ts show --help`.text();

      expect(helpResult).toContain("--mark-read");
    });
  });
});

describe("embed stats command", () => {
  describe("basic functionality", () => {
    it("should show help for embed stats command", async () => {
      const result = await $`bun ./src/index.ts embed stats --help`.text();

      expect(result).toContain("stats");
      expect(result).toContain("Show embedding statistics");
      expect(result).toContain("--account");
      expect(result).toContain("--all");
    });
  });
});

describe("EmailEmbeddingService integration", () => {
  beforeEach(() => {
    // Create unique test directory for each test
    TEST_DIR = join(tmpdir(), "email-semantic-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory (including LanceDB directories)
    if (TEST_DIR && existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Also clean up any .lance directories that might be created outside TEST_DIR
    const lancePath = join(tmpdir(), "email-semantic-test-*.lance");
    // The rmSync above should handle it since we're removing the whole TEST_DIR
  });

  it("should create embedding service with default options", async () => {
    const { EmailEmbeddingService } = await import("../../src/db/embedding-service");

    const dbPath = join(TEST_DIR, "test-embeddings.db");
    const service = new EmailEmbeddingService(dbPath);

    const stats = await service.getStats();
    expect(stats.totalEmbeddings).toBe(0);
    expect(stats.model).toBeDefined();

    service.close();
  });

  it("should create embedding service with custom source ID", async () => {
    const { EmailEmbeddingService } = await import("../../src/db/embedding-service");

    const dbPath = join(TEST_DIR, "test-embeddings.db");
    const service = new EmailEmbeddingService(dbPath, {
      sourceId: "email/test-account",
    });

    expect(service).toBeDefined();

    service.close();
  });

  it("should return empty embedded IDs when no emails embedded", async () => {
    const { EmailEmbeddingService } = await import("../../src/db/embedding-service");

    const dbPath = join(TEST_DIR, "test-embeddings.db");
    const service = new EmailEmbeddingService(dbPath);

    const embeddedIds = await service.getEmbeddedIds();
    expect(embeddedIds).toEqual([]);

    service.close();
  });
});
