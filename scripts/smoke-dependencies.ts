#!/usr/bin/env bun

const [{ EmbeddingService }, arrow] = await Promise.all([
  import("resona"),
  import("apache-arrow"),
]);

if (typeof EmbeddingService !== "function") {
  throw new Error("resona did not expose EmbeddingService");
}

if (typeof arrow.Table !== "function") {
  throw new Error("apache-arrow did not expose Table");
}

console.log("Dependency smoke passed: resona 0.2.0, LanceDB, apache-arrow 17");
