/**
 * Tests for error classification
 * Determines which errors are retryable (transient) vs permanent
 */

import { describe, it, expect } from "bun:test";
import { isRetryableError, classifyError } from "../../src/imap/error-classifier";

describe("isRetryableError", () => {
  it("should classify timeout errors as retryable", () => {
    const error = new Error("ETIMEDOUT");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should classify connection reset as retryable", () => {
    const error = new Error("ECONNRESET");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should classify broken pipe as retryable", () => {
    const error = new Error("EPIPE");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should classify connection refused as retryable", () => {
    const error = new Error("ECONNREFUSED");
    expect(isRetryableError(error)).toBe(true);
  });

  it("should classify auth errors as not retryable", () => {
    const error = new Error("Authentication failed");
    expect(isRetryableError(error)).toBe(false);
  });

  it("should classify invalid credentials as not retryable", () => {
    const error = new Error("Invalid credentials");
    expect(isRetryableError(error)).toBe(false);
  });

  it("should classify generic network errors as retryable", () => {
    const error = new Error("Network error occurred");
    expect(isRetryableError(error)).toBe(true);
  });
});

describe("classifyError", () => {
  it("should classify timeout errors correctly", () => {
    const error = new Error("Operation timed out");
    expect(classifyError(error)).toBe("timeout");
  });

  it("should classify network errors correctly", () => {
    const error = new Error("ECONNRESET");
    expect(classifyError(error)).toBe("network");
  });

  it("should classify auth errors correctly", () => {
    const error = new Error("Authentication failed");
    expect(classifyError(error)).toBe("auth");
  });

  it("should classify parse errors correctly", () => {
    const error = new Error("Failed to parse message");
    expect(classifyError(error)).toBe("parse");
  });

  it("should classify unknown errors as unknown", () => {
    const error = new Error("Something weird happened");
    expect(classifyError(error)).toBe("unknown");
  });
});
