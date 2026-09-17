import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OriginError, assertSameOrigin } from "../src/lib/http";

// next/headers only exists inside a Next request scope. Replace it with a
// stub that reads from a testable Map.
const store = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => store.get(name.toLowerCase()) ?? null,
  }),
}));

function setHeaders(kv: Record<string, string>): void {
  store.clear();
  for (const [k, v] of Object.entries(kv)) store.set(k.toLowerCase(), v);
}

describe("assertSameOrigin", () => {
  const savedTrust = process.env.TRUST_PROXY;

  beforeEach(() => {
    store.clear();
    delete process.env.TRUST_PROXY;
  });
  afterEach(() => {
    if (savedTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = savedTrust;
  });

  it("passes when origin is missing (server-to-server, no browser)", async () => {
    setHeaders({ host: "logbook.example.com" });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("passes when origin host matches Host", async () => {
    setHeaders({
      origin: "https://logbook.example.com",
      host: "logbook.example.com",
    });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("throws when origin host differs from Host", async () => {
    setHeaders({
      origin: "https://evil.example.com",
      host: "logbook.example.com",
    });
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(OriginError);
  });

  it("honours X-Forwarded-Host when TRUST_PROXY=true", async () => {
    process.env.TRUST_PROXY = "true";
    setHeaders({
      origin: "https://logbook.example.com",
      host: "internal.local",
      "x-forwarded-host": "logbook.example.com",
    });
    await expect(assertSameOrigin()).resolves.toBeUndefined();
  });

  it("ignores X-Forwarded-Host when TRUST_PROXY is not true", async () => {
    setHeaders({
      origin: "https://logbook.example.com",
      host: "internal.local",
      "x-forwarded-host": "logbook.example.com",
    });
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(OriginError);
  });

  it("refuses a malformed Origin header", async () => {
    setHeaders({ origin: "not a url", host: "logbook.example.com" });
    await expect(assertSameOrigin()).rejects.toBeInstanceOf(OriginError);
  });
});
