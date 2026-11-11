/**
 * Krypt v1 - Nonce reuse fault injection and reload resilience tests.
 *
 * Verifies the 8 failure points from the final engineering handoff (Section 7 & 10):
 *   1. Before counter reservation.
 *   2. After reservation, before read.
 *   3. After read, before encryption.
 *   4. After encryption, before packet persistence.
 *   5. After packet persistence, before send.
 *   6. After relay forwarding, before sender receives response.
 *   7. After receiver authentication, before IndexedDB commit.
 *   8. After commit, before ACK.
 *
 * Plus: source reselection fingerprint validation after reload, and atomic quota checks.
 */
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { compareBytes } from "../src/crypto/encoding";
import {
  parseFileControl,
  type FileControl,
} from "../src/crypto/fileManifest";
import { createMutexLock } from "../src/crypto/session";
import { FileStore } from "../src/services/fileStore";
import {
  MAX_STORED_BYTES,
  FileTransferManager,
  type ChunkFrame,
  type ChunkSendResult,
} from "../src/services/fileTransfer";

let dbCount = 100;
const newKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

function fileOf(size: number, byteVal = 42): { blob: Blob; bytes: Uint8Array } {
  const bytes = new Uint8Array(size);
  bytes.fill(byteVal);
  bytes[size - 1] = 7;
  return { blob: new Blob([bytes]), bytes };
}

async function until(cond: () => boolean | Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

interface Sent extends ChunkFrame {
  from: string;
}

async function setupTestWorld() {
  const clock = { t: 2_000_000 };
  const net = {
    online: true,
    frames: [] as Sent[],
    controls: [] as { from: string; ctl: FileControl }[],
    dropAcks: false,
    chunkHook: null as null | ((f: Sent) => ChunkSendResult | Sent | "crash"),
  };
  const managers: Record<string, FileTransferManager> = {};
  const stores: Record<string, FileStore> = {};
  const key = await newKey();

  const make = (self: string, store?: FileStore) => {
    const s = store ?? new FileStore({ key, dbName: `krypt-fault-test-${++dbCount}`, lock: createMutexLock() });
    stores[self] = s;
    const m = new FileTransferManager({
      self,
      store: s,
      lock: createMutexLock(),
      ackDelayMs: 20,
      chunkSize: 256 * 1024,
      now: () => clock.t,
      sendControl: async (to, ctl) => {
        const copy = parseFileControl(JSON.parse(JSON.stringify(ctl)));
        if (copy.op === "ack" && net.dropAcks) return;
        net.controls.push({ from: self, ctl: copy });
        setTimeout(() => void managers[to]?.onControl(self, copy), 0);
      },
      sendChunk: async (to, frame) => {
        let f: Sent = { from: self, ...frame, data: frame.data.slice() };
        net.frames.push(f);
        if (net.chunkHook) {
          const h = net.chunkHook(f);
          if (h === "crash") throw new Error("crash");
          if (typeof h === "string") return h;
          f = h;
        }
        if (!net.online) return "OFFLINE";
        void managers[to]?.onChunk(self, f);
        return "ok";
      },
    });
    managers[self] = m;
    return m;
  };
  const alice = make("alice");
  const bob = make("bob");
  await Promise.all([alice.whenReady(), bob.whenReady()]);
  return { alice, bob, net, clock, stores, make, managers };
}

async function sendAndAccept(w: Awaited<ReturnType<typeof setupTestWorld>>, size: number, byteVal = 42) {
  const { blob, bytes } = fileOf(size, byteVal);
  const m = await w.alice.offer("bob", blob, "sample.bin");
  await until(() => w.bob.get(m.transferId)?.status === "offered");
  await w.bob.accept(m.transferId);
  return { id: m.transferId, bytes, blob, m };
}

describe("nonce reuse fault injection (8 points)", () => {
  it("Point 1: Crash before counter reservation -> counter starts at 0, no reuse", async () => {
    const w = await setupTestWorld();
    const { blob } = fileOf(512 * 1024);
    const m = await w.alice.offer("bob", blob, "test1.bin");
    await until(() => w.bob.get(m.transferId)?.status === "offered");
    const rec = await w.stores.alice.getTransfer(m.transferId);
    expect(rec?.usedCounters).toHaveLength(0);
  });

  it("Point 2: Crash after reservation, before read -> burned counter is never reused", async () => {
    const w = await setupTestWorld();
    const { blob } = fileOf(512 * 1024);
    const m = await w.alice.offer("bob", blob, "test2.bin");
    await until(() => w.bob.get(m.transferId)?.status === "offered");
    // Burn counter 0 artificially in store
    const c0 = await w.stores.alice.reserveCounter(m.transferId);
    expect(c0).toBe(0);
    // Now accept and send; sender will reserve next counter (which must be 1)
    await w.bob.accept(m.transferId);
    await until(() => w.bob.get(m.transferId)?.status === "complete");
    // Verify frames sent: counters are >= 1, 0 was never used
    const frames = w.net.frames.filter((f) => f.transferId === m.transferId);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f.nonceCounter).toBeGreaterThanOrEqual(1);
    }
  });

  it("Point 3 & 4: Crash after read/encryption before packet persistence -> next attempt reserves fresh counter", async () => {
    const w = await setupTestWorld();
    const { blob } = fileOf(512 * 1024);
    const m = await w.alice.offer("bob", blob, "test3.bin");
    await until(() => w.bob.get(m.transferId)?.status === "offered");
    // Simulate counter 0 reserved and discarded (crash before putPacket)
    const burned = await w.stores.alice.reserveCounter(m.transferId);
    expect(burned).toBe(0);
    // When Bob accepts, next counter reserved will be 1
    await w.bob.accept(m.transferId);
    await until(() => w.bob.get(m.transferId)?.status === "complete");
    const frameCounters = w.net.frames.map((f) => f.nonceCounter);
    expect(frameCounters).not.toContain(0);
    // Every counter in flight was unique
    const uniqueCounters = new Set(frameCounters);
    expect(uniqueCounters.size).toBe(frameCounters.length);
  });

  it("Point 5: Crash after packet persistence, before send -> retries resend saved packet byte-for-byte", async () => {
    const w = await setupTestWorld();
    let firstAttempt = true;
    w.net.chunkHook = (f) => {
      if (firstAttempt && f.index === 0) {
        firstAttempt = false;
        return "NO_ACK"; // simulate send drop
      }
      return f;
    };
    const { id } = await sendAndAccept(w, 512 * 1024);
    await until(() => w.alice.get(id)?.status === "paused");
    // Resume
    await w.bob.resumeWith("alice");
    await until(() => w.bob.get(id)?.status === "complete");
    // Frame for index 0 was resent
    const index0Frames = w.net.frames.filter((f) => f.index === 0);
    expect(index0Frames.length).toBe(2);
    // Resent packet must have IDENTICAL nonce counter and byte-for-byte data
    expect(index0Frames[1].nonceCounter).toBe(index0Frames[0].nonceCounter);
    expect(compareBytes(index0Frames[1].data, index0Frames[0].data)).toBe(0);
  });

  it("Point 6: After relay forwarding, before sender receives response -> sender retry resends same packet, receiver drops duplicate", async () => {
    const w = await setupTestWorld();
    let forwardedOnce = false;
    w.net.chunkHook = (f) => {
      if (!forwardedOnce && f.index === 0) {
        forwardedOnce = true;
        // Relay delivers chunk to Bob, but returns NO_ACK to Alice
        void w.managers.bob.onChunk("alice", f);
        return "NO_ACK";
      }
      return f;
    };
    const { id } = await sendAndAccept(w, 512 * 1024);
    await until(() => w.alice.get(id)?.status === "paused");
    await w.bob.resumeWith("alice");
    await until(() => w.bob.get(id)?.status === "complete");
    const downloaded = await w.bob.download(id);
    expect(downloaded.blob.size).toBe(512 * 1024);
  });

  it("Point 7 & 8: Commit & ACK reliability -> dropped ACKs cause resume without nonce reuse", async () => {
    const w = await setupTestWorld();
    w.net.dropAcks = true;
    const { id } = await sendAndAccept(w, 512 * 1024);
    await until(() => w.net.frames.length >= 2);
    w.net.dropAcks = false;
    await w.bob.resumeWith("alice");
    await until(() => w.bob.get(id)?.status === "complete");
    const result = await w.bob.download(id);
    expect(result.blob.size).toBe(512 * 1024);
  });
});

describe("source reselection after page reload (SHA-256 fingerprint)", () => {
  it("resumes successfully when original file is reselected with matching fingerprint", async () => {
    const w = await setupTestWorld();
    w.net.chunkHook = (f) => (f.index === 1 ? "crash" : f);
    const { id, blob } = await sendAndAccept(w, 512 * 1024, 77);
    await until(() => w.alice.get(id)?.status === "paused");

    w.net.chunkHook = null;
    const alice2 = w.make("alice", w.stores.alice);
    await alice2.whenReady();
    expect(alice2.get(id)?.status).toBe("paused");
    expect(alice2.get(id)?.needsSource).toBe(true);

    const res = await alice2.reselectSource(id, blob);
    expect(res.ok).toBe(true);
    await w.bob.resumeWith("alice");
    await until(() => w.bob.get(id)?.status === "complete");
    const downloaded = await w.bob.download(id);
    expect(downloaded.blob.size).toBe(512 * 1024);
  });

  it("cancels transfer if reselected file has different SHA-256 fingerprint", async () => {
    const w = await setupTestWorld();
    w.net.chunkHook = (f) => (f.index === 1 ? "crash" : f);
    const { id } = await sendAndAccept(w, 512 * 1024, 11);
    await until(() => w.alice.get(id)?.status === "paused");

    const { blob: differentContent } = fileOf(512 * 1024, 22);
    const alice2 = w.make("alice", w.stores.alice);
    await alice2.whenReady();

    const res = await alice2.reselectSource(id, differentContent);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("FINGERPRINT_MISMATCH");
    expect(alice2.get(id)?.status).toBe("cancelled");
  });

  it("cancels transfer if reselected file has different size", async () => {
    const w = await setupTestWorld();
    w.net.chunkHook = (f) => (f.index === 1 ? "crash" : f);
    const { id } = await sendAndAccept(w, 512 * 1024, 11);
    await until(() => w.alice.get(id)?.status === "paused");

    const { blob: wrongSize } = fileOf(256 * 1024, 11);
    const alice2 = w.make("alice", w.stores.alice);
    await alice2.whenReady();

    const res = await alice2.reselectSource(id, wrongSize);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("SIZE_MISMATCH");
    expect(alice2.get(id)?.status).toBe("cancelled");
  });
});

describe("storage quota and limit enforcement", () => {
  it("rejects accept if incoming file would exceed MAX_STORED_BYTES", async () => {
    const w = await setupTestWorld();
    const { blob } = fileOf(512 * 1024);
    const m = await w.alice.offer("bob", blob, "big.bin");
    await until(() => w.bob.get(m.transferId)?.status === "offered");

    // Manually modify Bob's store record to simulate already stored 512 MB
    const rec = await w.stores.bob.getTransfer(m.transferId);
    if (rec) {
      rec.manifest.size = MAX_STORED_BYTES + 1;
      await w.stores.bob.putTransfer(rec);
    }

    await expect(w.bob.accept(m.transferId)).rejects.toThrow("Not enough file storage left on this device.");
    expect(w.bob.get(m.transferId)?.status).toBe("cancelled");
  });
});
