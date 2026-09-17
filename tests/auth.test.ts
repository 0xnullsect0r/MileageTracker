import { describe, expect, it, beforeEach } from "vitest";
import {
  checkPasswordStrength,
  clearRateLimit,
  normaliseEmail,
  rateLimit,
  safeEqual,
} from "../src/lib/auth";

describe("checkPasswordStrength", () => {
  it("refuses passwords shorter than 10 characters", () => {
    expect(checkPasswordStrength("short")).toEqual({
      ok: false,
      message: expect.stringContaining("10"),
    });
  });

  it("refuses digit-only passwords, however long", () => {
    expect(checkPasswordStrength("123456789012345")).toEqual({
      ok: false,
      message: expect.stringMatching(/digits/i),
    });
  });

  it("accepts a normal passphrase", () => {
    expect(checkPasswordStrength("correct horse battery")).toEqual({ ok: true });
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });
});

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("hello", "hello")).toBe(true);
  });
  it("returns false for different-length strings without leaking length", () => {
    expect(safeEqual("hello", "hello!")).toBe(false);
  });
  it("returns false for same-length differing strings", () => {
    expect(safeEqual("hello", "world")).toBe(false);
  });
});

describe("rateLimit", () => {
  beforeEach(() => {
    // Isolate: clear anything a prior test left behind for these keys.
    clearRateLimit("test-a");
    clearRateLimit("test-b");
  });

  it("allows the first attempt", () => {
    expect(rateLimit("test-a").allowed).toBe(true);
  });

  it("blocks after 8 attempts in a window", () => {
    for (let i = 0; i < 8; i++) {
      expect(rateLimit("test-a").allowed).toBe(true);
    }
    const blocked = rateLimit("test-a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryInSeconds).toBeGreaterThan(0);
  });

  it("keeps buckets independent by key", () => {
    for (let i = 0; i < 9; i++) rateLimit("test-a");
    expect(rateLimit("test-a").allowed).toBe(false);
    expect(rateLimit("test-b").allowed).toBe(true);
  });

  it("clearRateLimit resets a bucket immediately", () => {
    for (let i = 0; i < 9; i++) rateLimit("test-a");
    expect(rateLimit("test-a").allowed).toBe(false);
    clearRateLimit("test-a");
    expect(rateLimit("test-a").allowed).toBe(true);
  });
});
