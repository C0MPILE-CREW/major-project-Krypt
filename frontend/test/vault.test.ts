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
import { fromBase64url, toBase64url } from "../src/crypto/encoding";
import { IndexedDbPrekeyStore } from "../src/crypto/session-store";
import { mlkem1024 } from "../src/crypto/pq";
import type { VaultData } from "../src/crypto/vault";

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

describe("vault prekey export & multi-device login", () => {
  const newKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  let dbIdx = 0;
  const nextDb = () => `prekey-test-db-${++dbIdx}`;

  it("exports prekeys from Device 1 and restores them seamlessly into Device 2", async () => {
    const key1 = await newKey();
    const db1Name = nextDb();
    const store1 = new IndexedDbPrekeyStore({ key: key1, dbName: db1Name });

    const spkPair = mlkem1024.keygen();
    const opkPair1 = mlkem1024.keygen();
    const opkPair2 = mlkem1024.keygen();

    await store1.putSignedPrekey({ keyId: 7, ...spkPair, createdAt: 1000 });
    await store1.putOneTimePrekeys([
      { keyId: 101, ...opkPair1, createdAt: 1001 },
      { keyId: 102, ...opkPair2, createdAt: 1002 },
    ]);
    await store1.recordAcceptedSession(7, "sid-test-session-1");

    // Device 1 exports all prekeys
    const exported = await store1.exportAll();
    await store1.close();

    expect(exported.signedPrekeys).toHaveLength(1);
    expect(exported.oneTimePrekeys).toHaveLength(2);
    expect(exported.acceptedSessions).toEqual([{ spkId: 7, sessionId: "sid-test-session-1" }]);

    // Pack into VaultData
    const vault: VaultData = {
      version: 2,
      privateKey: "mock-identity-key-bundle",
      contacts: [{ id: "alice", payload: "contact-alice" }],
      prekeys: {
        signedPrekeys: exported.signedPrekeys.map((r) => ({
          keyId: r.keyId,
          publicKey: toBase64url(r.publicKey),
          secretKey: toBase64url(r.secretKey),
          createdAt: r.createdAt,
        })),
        oneTimePrekeys: exported.oneTimePrekeys.map((r) => ({
          keyId: r.keyId,
          publicKey: toBase64url(r.publicKey),
          secretKey: toBase64url(r.secretKey),
          createdAt: r.createdAt,
        })),
        acceptedSessions: exported.acceptedSessions,
        spkMeta: { current: 7, retired: [] },
      },
    };

    // Encrypt vault file
    const vaultCiphertext = await encryptVaultData(JSON.stringify(vault), "vault-password-456");

    // Device 2 decrypts vault
    const decryptedJson = await decryptVaultData(vaultCiphertext, "vault-password-456");
    const restoredVault: VaultData = JSON.parse(decryptedJson);

    expect(restoredVault.privateKey).toBe("mock-identity-key-bundle");
    expect(restoredVault.contacts).toHaveLength(1);
    expect(restoredVault.prekeys).toBeDefined();

    // Device 2 restores prekeys into its own store
    const key2 = await newKey();
    const db2Name = nextDb();
    const store2 = new IndexedDbPrekeyStore({ key: key2, dbName: db2Name });

    const signedPrekeys = (restoredVault.prekeys!.signedPrekeys || []).map((r) => ({
      keyId: r.keyId,
      publicKey: fromBase64url(r.publicKey),
      secretKey: fromBase64url(r.secretKey),
      createdAt: r.createdAt,
    }));
    const oneTimePrekeys = (restoredVault.prekeys!.oneTimePrekeys || []).map((r) => ({
      keyId: r.keyId,
      publicKey: fromBase64url(r.publicKey),
      secretKey: fromBase64url(r.secretKey),
      createdAt: r.createdAt,
    }));

    await store2.importAll({
      signedPrekeys,
      oneTimePrekeys,
      acceptedSessions: restoredVault.prekeys!.acceptedSessions,
    });

    // Verify Device 2 holds the exact private keys and can answer handshakes
    const restoredSpk = await store2.getSignedPrekey(7);
    expect(restoredSpk).toBeDefined();
    expect(restoredSpk!.publicKey).toEqual(spkPair.publicKey);
    expect(restoredSpk!.secretKey).toEqual(spkPair.secretKey);

    const restoredOpk1 = await store2.getOneTimePrekey(101);
    expect(restoredOpk1).toBeDefined();
    expect(restoredOpk1!.publicKey).toEqual(opkPair1.publicKey);
    expect(restoredOpk1!.secretKey).toEqual(opkPair1.secretKey);

    const restoredOpk2 = await store2.getOneTimePrekey(102);
    expect(restoredOpk2).toBeDefined();
    expect(restoredOpk2!.publicKey).toEqual(opkPair2.publicKey);
    expect(restoredOpk2!.secretKey).toEqual(opkPair2.secretKey);

    expect(await store2.hasAcceptedSession(7, "sid-test-session-1")).toBe(true);
    expect(await store2.hasAcceptedSession(7, "non-existent-sid")).toBe(false);

    await store2.close();
  });

  it("handles legacy vaults without prekeys smoothly without throwing", async () => {
    const legacyVault: VaultData = {
      privateKey: "legacy-identity-bundle",
      contacts: [{ id: "bob", payload: "contact-bob" }],
    };

    const enc = await encryptVaultData(JSON.stringify(legacyVault), "pw-legacy");
    const dec = await decryptVaultData(enc, "pw-legacy");
    const parsed: VaultData = JSON.parse(dec);

    expect(parsed.privateKey).toBe("legacy-identity-bundle");
    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.prekeys).toBeUndefined();
  });
});
