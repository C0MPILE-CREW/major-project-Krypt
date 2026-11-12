/**
 * At-rest formats in crypto/vault.ts and crypto/localStore.ts.
 *
 * - Vault files: only "ENC:v2:" (PBKDF2 600k -> AES-256-GCM) is read;
 *   plaintext and the older "ENC:" format fail closed.
 * - The fixtures were written by the code before both files moved onto
 *   session-store seal/open, so they pin the stored bytes as unchanged.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { toBase64 } from "@krypt/shared";
import type { UserIdentityKeys } from "../src/crypto/mlkem";

vi.stubGlobal("window", globalThis);
const { decryptVaultData, encryptVaultData, exportChatBackup, importChatBackup } = await import("../src/crypto/vault");
const { decryptLocal, encryptLocal } = await import("../src/crypto/localStore");
const { db } = await import("../src/services/db");

const OLD_VAULT =
  "ENC:v2:BwcHBwcHBwcHBwcHBwcHBwkJCQkJCQkJCQkJCUQUHAV0xGzZRGqXNS1rTSMwdHSs2JhZQV7RRXKnY2EcRuOqnW5OrHf0pTauNg==";
const OLD_LOCAL = "LOC:BQUFBQUFBQUFBQUFpZI0u2q3If5RD9uEu81CAz6fZHVjaTwfj4eLlqWtAg==";

describe("vault files", () => {
  it("round-trips under the password and rejects a wrong one", async () => {
    const file = await encryptVaultData('{"hello":"vault"}', "correct horse");
    expect(file.startsWith("ENC:v2:")).toBe(true);
    expect(await decryptVaultData(`${file}\n`, "correct horse")).toBe('{"hello":"vault"}');
    await expect(decryptVaultData(file, "wrong password")).rejects.toThrow(/Wrong password/);
  });

  it("reads a file written by the previous implementation", async () => {
    expect(await decryptVaultData(OLD_VAULT, "fixture password")).toBe('{"written":"by the old code"}');
  });

  it("rejects the pre-v2 ENC: format and unencrypted files", async () => {
    const old = "ENC:" + toBase64(new Uint8Array(64));
    await expect(decryptVaultData(old, "pw")).rejects.toThrow(/old format/);
    await expect(decryptVaultData('{"kemPub":"x"}', "pw")).rejects.toThrow(/not encrypted/);
  });
});

describe("local store entries", () => {
  const keys = { kemSecretKey: new Uint8Array(3168).fill(3) } as UserIdentityKeys;

  it("reads an entry written by the previous implementation and round-trips new ones", async () => {
    expect(await decryptLocal(OLD_LOCAL, keys)).toBe("old local entry");
    expect(await decryptLocal(await encryptLocal("new entry", keys), keys)).toBe("new entry");
  });

  it("fails closed on plaintext and on a flipped bit", async () => {
    await expect(decryptLocal("plain text", keys)).rejects.toThrow(/not encrypted/);
    const flipped = OLD_LOCAL.slice(0, -4) + (OLD_LOCAL.at(-4) === "A" ? "B" : "A") + OLD_LOCAL.slice(-3);
    await expect(decryptLocal(flipped, keys)).rejects.toThrow(/Failed to decrypt/);
  });
});

describe("chat backups", () => {
  it("imports backups into a database that already has messages with colliding IDs", async () => {
    await db.messages.clear();

    // Device A has 2 messages
    await db.messages.bulkAdd([
      { payload: "enc_msg_A1" },
      { payload: "enc_msg_A2" },
    ]);
    const backupStr = await exportChatBackup("pass123");

    // Device B already has messages with id: 1 and id: 2
    await db.messages.clear();
    await db.messages.bulkAdd([
      { payload: "existing_devB_1" },
      { payload: "existing_devB_2" },
    ]);

    // Restore Device A's backup onto Device B - must NOT throw ConstraintError
    await importChatBackup(backupStr, "pass123");

    const all = await db.messages.toArray();
    expect(all.length).toBe(4);
    expect(all.map((m) => m.payload)).toEqual([
      "existing_devB_1",
      "existing_devB_2",
      "enc_msg_A1",
      "enc_msg_A2",
    ]);
    // Each message has a unique auto-incremented primary key
    const ids = all.map((m) => m.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("handles legacy backups that contained explicit id fields and deduplicates", async () => {
    await db.messages.clear();
    await db.messages.bulkAdd([{ payload: "msg_already_here" }]);

    // Simulated legacy backup created before id stripping:
    const legacyJson = JSON.stringify({
      messages: [
        { id: 1, payload: "msg_already_here" }, // Duplicate, should be skipped
        { id: 2, payload: "msg_new_from_backup" }, // Collides with id: 1/2 if id wasn't stripped
      ],
    });
    const backupStr = await encryptVaultData(legacyJson, "pass123");

    await importChatBackup(backupStr, "pass123");

    const all = await db.messages.toArray();
    expect(all.length).toBe(2);
    expect(all.map((m) => m.payload)).toEqual([
      "msg_already_here",
      "msg_new_from_backup",
    ]);
  });
});
