import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("portable dependency graph", () => {
  it("pins resona and apache-arrow without a repository-relative dependency", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
    );

    expect(packageJson.dependencies.resona).toBe("0.2.0");
    expect(packageJson.dependencies["apache-arrow"]).toBe("17.0.0");
    expect(packageJson.dependencies.resona.startsWith("file:")).toBe(false);
  });

  it("loads the semantic-search runtime dependency graph", async () => {
    const [{ EmbeddingService }, arrow] = await Promise.all([
      import("resona"),
      import("apache-arrow"),
    ]);

    expect(typeof EmbeddingService).toBe("function");
    expect(typeof arrow.Table).toBe("function");
  });
});
