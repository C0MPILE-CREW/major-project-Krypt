import { describe, expect, it } from "vitest";
import {
  AttachmentError,
  ALLOWED_MEDIA_MIME_TYPES,
  encryptAttachment,
  isSafeMediaMime,
  parseAttachmentMeta,
} from "../src/crypto/media";

describe("Media Attachment Security & MIME Type Whitelisting", () => {
  it("recognizes safe raster and audio formats", () => {
    expect(ALLOWED_MEDIA_MIME_TYPES.has("image/png")).toBe(true);
    expect(isSafeMediaMime("image/png")).toBe(true);
    expect(isSafeMediaMime("image/jpeg")).toBe(true);
    expect(isSafeMediaMime("image/webp")).toBe(true);
    expect(isSafeMediaMime("audio/webm;codecs=opus")).toBe(true);
    expect(isSafeMediaMime("audio/mpeg")).toBe(true);
  });

  it("rejects active or scriptable MIME types", () => {
    expect(isSafeMediaMime("image/svg+xml")).toBe(false);
    expect(isSafeMediaMime("text/html")).toBe(false);
    expect(isSafeMediaMime("application/javascript")).toBe(false);
    expect(isSafeMediaMime("application/octet-stream")).toBe(false);
    expect(isSafeMediaMime("text/plain")).toBe(false);
  });

  it("refuses to encrypt attachments with unsafe MIME types", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await expect(encryptAttachment(data, "image/svg+xml")).rejects.toThrow(AttachmentError);
    await expect(encryptAttachment(data, "text/html")).rejects.toThrow(AttachmentError);
    await expect(encryptAttachment(data, "application/javascript")).rejects.toThrow(AttachmentError);
  });

  it("refuses to parse decrypted metadata with unsafe MIME types", () => {
    const raw = {
      key: "a".repeat(43),
      iv: "b".repeat(16),
      sha256: "c".repeat(43),
      mime: "image/svg+xml",
      size: 100,
    };
    expect(() => parseAttachmentMeta(raw)).toThrow(AttachmentError);
  });
});

