import { describe, expect, it } from "vitest";
import {
  AttachmentError,
  sanitiseFilename,
  sniffMagic,
  storagePathFor,
} from "../src/lib/attachments";

describe("sniffMagic", () => {
  it("accepts a JPEG by its FFD8FF magic bytes", () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffMagic(b)).toEqual({ mime: "image/jpeg", ext: "jpg" });
  });

  it("accepts a PNG by its 8-byte signature", () => {
    const b = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffMagic(b)).toEqual({ mime: "image/png", ext: "png" });
  });

  it("accepts a WebP by its RIFF...WEBP header", () => {
    const b = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP"),
    ]);
    expect(sniffMagic(b)).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("accepts a PDF by its %PDF- prefix", () => {
    const b = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3");
    expect(sniffMagic(b)).toEqual({ mime: "application/pdf", ext: "pdf" });
  });

  it("refuses HTML — the classic dangerous MIME to render inline", () => {
    const b = Buffer.from("<html><body>hi</body></html>");
    expect(() => sniffMagic(b)).toThrow(AttachmentError);
  });

  it("refuses a JPEG renamed to something else (bytes still say JS)", () => {
    // Zero-filled — no magic — is refused too. The client never picks the
    // format; the server does, from what's actually on disk.
    const b = Buffer.alloc(64, 0);
    expect(() => sniffMagic(b)).toThrow(AttachmentError);
  });
});

describe("sanitiseFilename", () => {
  it("strips path separators from a Windows-style path", () => {
    expect(sanitiseFilename("..\\..\\etc\\passwd")).toBe("passwd");
  });

  it("strips path separators from a POSIX path", () => {
    expect(sanitiseFilename("/etc/passwd")).toBe("passwd");
  });

  it("removes leading dots so it cannot look like .htaccess", () => {
    expect(sanitiseFilename("...secret")).toBe("secret");
  });

  it("caps very long names at 200 chars", () => {
    expect(sanitiseFilename("a".repeat(500))).toHaveLength(200);
  });

  it("falls back to a default when the input reduces to empty", () => {
    expect(sanitiseFilename("///")).toBe("attachment");
    expect(sanitiseFilename("")).toBe("attachment");
  });

  it("strips control characters — an injected \\n is not part of the name", () => {
    expect(sanitiseFilename("okay\nname.pdf")).toBe("okayname.pdf");
  });
});

describe("storagePathFor", () => {
  it("shards on the SHA of the id, so no single directory blows up", () => {
    const p = storagePathFor("00000000-0000-0000-0000-000000000000", "pdf");
    expect(p).toMatch(/^attachments\/[0-9a-f]{2}\/[0-9a-f]{2}\/00000000-0000-0000-0000-000000000000\.pdf$/);
  });

  it("is stable for the same id and extension", () => {
    const a = storagePathFor("abc123", "png");
    const b = storagePathFor("abc123", "png");
    expect(a).toBe(b);
  });
});
