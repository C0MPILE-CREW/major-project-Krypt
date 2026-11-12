import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const users = new Map<string, any>();
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username?: string; id?: string } }) => {
        if (where.username) return users.get(where.username) ?? null;
        if (where.id) {
          for (const u of users.values()) {
            if (u.id === where.id) return u;
          }
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        const record = { id: `u-${data.username}`, tokenVersion: 1, mailboxEnabled: true, ...data };
        users.set(data.username, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        for (const u of users.values()) {
          if (u.id === where.id) {
            if (data.tokenVersion?.increment) u.tokenVersion += data.tokenVersion.increment;
            if (data.mailboxEnabled !== undefined) u.mailboxEnabled = data.mailboxEnabled;
            return u;
          }
        }
        return null;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === "function" ? (arg as any)(db) : arg)),
    _users: users,
  };
});

vi.mock("../src/db.js", () => ({ prisma: db }));
vi.mock("../src/realtime.js", () => ({ emitToUser: vi.fn(() => true), onlineUsers: new Map(), setIo: vi.fn() }));

process.env.AUTH_TOKEN_SECRET = "hardening-test-secret";
const { createApp } = await import("../src/app.js");
const { issueToken, verifyToken } = await import("../src/auth.js");

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

describe("Auth Hardening & Anti-Enumeration", () => {
  it("returns uniform 200 with synthetic salt/ephemeral for non-existent users", async () => {
    const res = await post("/login/challenge", {
      username: "ghost_nonexistent_user",
      clientEphemeralPublic: "aa".repeat(32),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.challengeId).toBeDefined();
    expect(data.salt).toBeDefined();
    expect(data.serverEphemeralPublic).toBeDefined();
  });

  it("fails verification gracefully for synthetic challenge without leaking existence", async () => {
    const chalRes = await post("/login/challenge", {
      username: "ghost_attacker_target",
      clientEphemeralPublic: "aa".repeat(32),
    });
    const { challengeId } = await chalRes.json();

    const verifyRes = await post("/login/verify", {
      username: "ghost_attacker_target",
      challengeId,
      clientEphemeralPublic: "bb".repeat(32),
      clientSessionProof: "cc".repeat(32),
    });
    expect(verifyRes.status).toBe(401);
    expect(await verifyRes.json()).toEqual({ error: "Invalid username or password." });
  });

  it("supports challengeId so concurrent handshakes do not cancel each other", async () => {
    // Session 1 begins
    const chal1 = await post("/login/challenge", {
      username: "alice_concurrent",
      clientEphemeralPublic: "11".repeat(32),
    });
    const data1 = await chal1.json();

    // Session 2 begins for the same user before session 1 completes
    const chal2 = await post("/login/challenge", {
      username: "alice_concurrent",
      clientEphemeralPublic: "22".repeat(32),
    });
    const data2 = await chal2.json();

    expect(data1.challengeId).not.toBe(data2.challengeId);

    // Both challenges exist simultaneously in activeLoginChallenges
    const v1 = await post("/login/verify", {
      username: "alice_concurrent",
      challengeId: data1.challengeId,
      clientEphemeralPublic: "11".repeat(32),
      clientSessionProof: "33".repeat(32),
    });
    // Synthetic fails with 401, NOT 400 "expired or invalid"
    expect(v1.status).toBe(401);
  });

  it("allows revoking all sessions by incrementing tokenVersion", async () => {
    const user = await db.user.create({
      data: {
        username: "revocable_user",
        publicKey: "pk1",
        srpSalt: "salt1",
        srpVerifier: "ver1",
      },
    });

    const token = issueToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion });
    const verified = verifyToken(token);
    expect(verified?.tokenVersion).toBe(1);

    // Call /auth/revoke
    const revokeRes = await post("/auth/revoke", {}, token);
    expect(revokeRes.status).toBe(200);
    expect(await revokeRes.json()).toEqual({ success: true, message: "All sessions revoked." });

    const updatedUser = await db.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.tokenVersion).toBe(2);
  });

  it("allows querying and toggling offline mailbox setting", async () => {
    const user = await db.user.create({
      data: {
        username: "mailbox_user",
        publicKey: "pk2",
        srpSalt: "salt2",
        srpVerifier: "ver2",
      },
    });

    const token = issueToken({ userId: user.id, username: user.username, tokenVersion: user.tokenVersion });

    // Initial setting is true
    const getRes = await fetch(`${base}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ mailboxEnabled: true });

    // Toggle to false
    const postRes = await post("/settings/mailbox", { mailboxEnabled: false }, token);
    expect(postRes.status).toBe(200);
    expect(await postRes.json()).toEqual({ success: true, mailboxEnabled: false });

    // Verify it updated
    const updatedUser = await db.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.mailboxEnabled).toBe(false);
  });
});

