/**
 * AES-256-GCM for file chunks (plan 5.5). The file key is imported once per
 * transfer as a non-extractable CryptoKey. The output is ciphertext ‖ 16-byte
 * tag; decrypt returns plaintext only after the tag verifies. Nonce and AAD
 * come from crypto/fileManifest.ts.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { fromBase64url, toBase64url } from "./encoding";
import { GCM_TAG_BYTES } from "./fileManifest";
import { bs } from "./kdf";

const GCM_NONCE_BYTES = 12;

/**
 * Incrementally computes the SHA-256 fingerprint of a file in chunks without
 * buffering the entire file in memory (plan 5.6).
 */
export async function computeFileFingerprint(file: Blob, chunkSize = 1024 * 1024): Promise<string> {
  const h = sha256.create();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const buf = await slice.arrayBuffer();
    h.update(new Uint8Array(buf));
  }
  return toBase64url(h.digest());
}

export async function importFileKey(fileKey: string): Promise<CryptoKey> {
  const raw = fromBase64url(fileKey);
  if (raw.length !== 32) throw new Error("file key must be 32 bytes");
  try {
    return await crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

export async function encryptFileChunk(args: {
  fileKey: CryptoKey;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  if (args.nonce.length !== GCM_NONCE_BYTES) throw new Error("invalid nonce length");
  const out = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bs(args.nonce), additionalData: bs(args.aad), tagLength: 128 },
    args.fileKey,
    bs(args.plaintext),
  );
  return new Uint8Array(out);
}

export async function decryptFileChunk(args: {
  fileKey: CryptoKey;
  nonce: Uint8Array;
  ciphertextAndTag: Uint8Array;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  if (args.nonce.length !== GCM_NONCE_BYTES) throw new Error("invalid nonce length");
  if (args.ciphertextAndTag.length < GCM_TAG_BYTES) throw new Error("truncated chunk");
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(args.nonce), additionalData: bs(args.aad), tagLength: 128 },
    args.fileKey,
    bs(args.ciphertextAndTag),
  );
  return new Uint8Array(out);
}
