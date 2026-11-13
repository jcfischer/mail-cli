/**
 * Email Embedding Service Tests
 * TDD: RED phase - tests written first
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { EmailEmbeddingService } from "../../src/db/embedding-service";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

// Test database path - LanceDB converts .db to .lance directory
const TEST_DB_PATH = join(import.meta.dir, "test-embeddings.db");
const TEST_LANCE_PATH = join(import.meta.dir, "test-embeddings.lance");
const TEST_DIR = import.meta.dir;

function cleanupTestDb() {
  // Clean up LanceDB directory (resona converts .db to .lance)
  if (existsSync(TEST_LANCE_PATH)) {
    rmSync(TEST_LANCE_PATH, { recursive: true, force: true });
  }
}

describe("EmailEmbeddingService - Resona Model Upgrade (TDD)", () => {
  let service: EmailEmbeddingService;

  beforeAll(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    cleanupTestDb();
  });

  beforeEach(() => {
    cleanupTestDb();
    service = new EmailEmbeddingService(TEST_DB_PATH);
  });

  afterAll(() => {
    if (service) {
      service.close();
    }
    cleanupTestDb();
  });

  describe("T-1.1: EmailToEmbed interface with body field", () => {
    it("should accept body field instead of snippet", async () => {
      const result = await service.embedEmail({
        id: "msg-body-001",
        subject: "Test with body field",
        body: "This is the full email body content that should be embedded.",
        from: "test@example.com",
        date: new Date("2025-01-15"),
      });

      expect(result.embedded).toBe(1);
      expect(result.errors).toBe(0);
    });

    it("should handle long body content", async () => {
      const longBody = "Lorem ipsum dolor sit amet. ".repeat(500); // ~14k chars

      const result = await service.embedEmail({
        id: "msg-body-002",
        subject: "Long email",
        body: longBody,
        from: "test@example.com",
        date: new Date("2025-01-15"),
      });

      expect(result.embedded).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  describe("T-1.2: Default model is bge-m3", () => {
    it("should use bge-m3 by default", async () => {
      // Service created in beforeEach with no model specified
      expect(service).toBeDefined();
      expect(service.getSourceId()).toBe("email/default");

      // Verify it works with default model
      const result = await service.embedEmail({
        id: "msg-model-001",
        subject: "Test default model",
        body: "Testing bge-m3 default model",
        from: "test@example.com",
        date: new Date("2025-01-15"),
      });

      expect(result.embedded).toBe(1);
    });

    it("should allow custom model override", () => {
      // Use mxbai-embed-large as a valid alternative model
      const customService = new EmailEmbeddingService(TEST_DB_PATH, {
        sourceId: "test-custom-model",
        model: "mxbai-embed-large",
      });

      expect(customService).toBeDefined();
      customService.close();
    });
  });

  describe("T-1.3: Chunking configuration constants", () => {
    it("should handle emails longer than chunk size (18000 chars)", async () => {
      // Create email with 25k chars (larger than DEFAULT_CHUNK_SIZE = 18000)
      const longBody = "x".repeat(25000);

      const result = await service.embedEmail({
        id: "msg-chunk-001",
        subject: "Long email for chunking",
        body: longBody,
        from: "test@example.com",
        date: new Date("2025-01-15"),
      });

      // Should embed successfully (chunking handled by resona)
      expect(result.embedded).toBeGreaterThanOrEqual(1);
      expect(result.errors).toBe(0);
    });

    it("should truncate emails longer than MAX_EMAIL_LENGTH (100k chars)", async () => {
      // Create email with 150k chars (larger than MAX_EMAIL_LENGTH = 100000)
      const veryLongBody = "x".repeat(150000);

      const result = await service.embedEmail({
        id: "msg-truncate-001",
        subject: "Very long email",
        body: veryLongBody,
        from: "test@example.com",
        date: new Date("2025-01-15"),
      });

      // Should not throw, should truncate and embed
      expect(result.embedded).toBe(1);
      expect(result.errors).toBe(0);
    });
  });
});

describe("EmailEmbeddingService", () => {
  let service: EmailEmbeddingService;

  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    cleanupTestDb();
  });

  beforeEach(() => {
    // Clean up test database before each test
    cleanupTestDb();
    service = new EmailEmbeddingService(TEST_DB_PATH);
  });

  afterAll(() => {
    // Clean up
    if (service) {
      service.close();
    }
    cleanupTestDb();
  });

  describe("initialization", () => {
    it("should create service with default Ollama provider", () => {
      expect(service).toBeDefined();
    });

    it("should use source ID email/default by default", () => {
      const sourceId = service.getSourceId();
      expect(sourceId).toBe("email/default");
    });

    it("should allow custom source ID", () => {
      const customService = new EmailEmbeddingService(TEST_DB_PATH, {
        sourceId: "email/work",
      });
      expect(customService.getSourceId()).toBe("email/work");
      customService.close();
    });
  });

  describe("embedEmail", () => {
    it("should embed a single email", async () => {
      const result = await service.embedEmail({
        id: "msg-001",
        subject: "Weekly team meeting notes",
        body: "Discussion about project roadmap and Q1 goals",
        from: "alice@example.com",
        date: new Date("2025-01-15"),
      });

      expect(result.embedded).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it("should skip unchanged emails", async () => {
      const email = {
        id: "msg-002",
        subject: "Budget review",
        body: "Annual budget discussion",
        from: "bob@example.com",
        date: new Date("2025-01-15"),
      };

      // First embed
      await service.embedEmail(email);

      // Second embed - should skip
      const result = await service.embedEmail(email);
      expect(result.embedded).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it("should re-embed when content changes", async () => {
      const email = {
        id: "msg-003",
        subject: "Original subject",
        body: "Original content",
        from: "carol@example.com",
        date: new Date("2025-01-15"),
      };

      // First embed
      await service.embedEmail(email);

      // Update and re-embed
      email.subject = "Updated subject";
      const result = await service.embedEmail(email, { force: true });
      expect(result.embedded).toBe(1);
    });
  });

  describe("embedBatch", () => {
    it("should embed multiple emails", async () => {
      const emails = [
        {
          id: "batch-001",
          subject: "Project kickoff meeting",
          body: "Starting the new initiative next week",
          from: "dan@example.com",
          date: new Date("2025-01-10"),
        },
        {
          id: "batch-002",
          subject: "Technical design review",
          body: "Architecture decisions for the backend",
          from: "eve@example.com",
          date: new Date("2025-01-11"),
        },
        {
          id: "batch-003",
          subject: "Sprint planning session",
          body: "Planning tasks for the next two weeks",
          from: "frank@example.com",
          date: new Date("2025-01-12"),
        },
      ];

      const result = await service.embedBatch(emails);
      expect(result.embedded).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it("should report progress during batch embedding", async () => {
      const emails = [
        { id: "prog-001", subject: "Email 1", body: "Content 1", from: "a@example.com", date: new Date() },
        { id: "prog-002", subject: "Email 2", body: "Content 2", from: "b@example.com", date: new Date() },
      ];

      const progressCalls: number[] = [];
      await service.embedBatch(emails, {
        onProgress: (progress) => {
          progressCalls.push(progress.processed);
        },
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it("should accept storeBatchSize option", async () => {
      const emails = [
        { id: "store-001", subject: "Email 1", body: "Content 1", from: "a@example.com", date: new Date() },
        { id: "store-002", subject: "Email 2", body: "Content 2", from: "b@example.com", date: new Date() },
      ];

      // storeBatchSize controls LanceDB write buffer size
      // This test verifies the option is accepted without error
      const result = await service.embedBatch(emails, {
        storeBatchSize: 1000,
      });

      expect(result.embedded).toBe(2);
      expect(result.errors).toBe(0);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      // Seed test data
      await service.embedBatch([
        {
          id: "search-001",
          subject: "Machine learning project update",
          body: "Deep learning model training progress and neural network optimization",
          from: "ml-team@example.com",
          date: new Date("2025-01-15"),
        },
        {
          id: "search-002",
          subject: "Quarterly financial report",
          body: "Revenue analysis and budget forecasting for Q1",
          from: "finance@example.com",
          date: new Date("2025-01-14"),
        },
        {
          id: "search-003",
          subject: "Team building event planning",
          body: "Organizing the annual company retreat and activities",
          from: "hr@example.com",
          date: new Date("2025-01-13"),
        },
        {
          id: "search-004",
          subject: "AI research findings",
          body: "Latest developments in artificial intelligence and natural language processing",
          from: "research@example.com",
          date: new Date("2025-01-12"),
        },
      ]);
    });

    it("should find semantically similar emails", async () => {
      const results = await service.search("neural networks and AI", 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // AI/ML related emails should be near the top
      const ids = results.map((r) => r.id);
      expect(ids.some((id) => ["search-001", "search-004"].includes(id))).toBe(true);
    });

    it("should return similarity scores", async () => {
      const results = await service.search("budget and finance", 2);

      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        // Similarity is derived from distance, so it may vary
        expect(typeof result.similarity).toBe("number");
      });
    });

    it("should include email metadata in results", async () => {
      const results = await service.search("company event", 1);

      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result.id).toBeDefined();
      expect(result.similarity).toBeDefined();
    });

    it("should handle empty results gracefully", async () => {
      // Search for something very unlikely
      const results = await service.search("xyzzy quantum zephyr", 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return embedding statistics", async () => {
      await service.embedBatch([
        { id: "stat-001", subject: "Test 1", body: "Content 1", from: "a@example.com", date: new Date() },
        { id: "stat-002", subject: "Test 2", body: "Content 2", from: "b@example.com", date: new Date() },
      ]);

      const stats = await service.getStats();
      expect(stats.totalEmbeddings).toBe(2);
      expect(stats.model).toBeDefined();
      expect(stats.dimensions).toBeGreaterThan(0);
    });
  });

  describe("cleanup", () => {
    it("should remove embeddings not in provided list", async () => {
      await service.embedBatch([
        { id: "keep-001", subject: "Keep 1", body: "Content 1", from: "a@example.com", date: new Date() },
        { id: "keep-002", subject: "Keep 2", body: "Content 2", from: "b@example.com", date: new Date() },
        { id: "remove-001", subject: "Remove", body: "Content 3", from: "c@example.com", date: new Date() },
      ]);

      const removed = await service.cleanup(["keep-001", "keep-002"]);
      expect(removed).toBe(1);

      const stats = await service.getStats();
      expect(stats.totalEmbeddings).toBe(2);
    });
  });

  describe("getEmbeddedIds", () => {
    it("should return list of embedded email IDs", async () => {
      await service.embedBatch([
        { id: "list-001", subject: "Email 1", body: "Content 1", from: "a@example.com", date: new Date() },
        { id: "list-002", subject: "Email 2", body: "Content 2", from: "b@example.com", date: new Date() },
      ]);

      const ids = await service.getEmbeddedIds();
      expect(ids).toContain("list-001");
      expect(ids).toContain("list-002");
      expect(ids.length).toBe(2);
    });
  });
});
