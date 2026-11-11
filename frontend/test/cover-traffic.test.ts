import { describe, expect, it } from "vitest";
import { encodeAppMessage, parseAppMessage, type AppMessage } from "../src/crypto/appMessage";
import { fromBase64url } from "../src/crypto/encoding";
import { world, send, recv } from "./helpers";

describe("cover traffic & uniform padding", () => {
  it("encodes messages into uniform padding buckets", () => {
    const base: AppMessage = { v: 1, id: "test-id-1", sentAt: Date.now() };

    // 1. Minimum bucket is 512 bytes
    const short = encodeAppMessage({ ...base, text: "ping" });
    expect(short.byteLength).toBe(512);

    // 2. Cover message also has exactly 512 bytes
    const cover = encodeAppMessage(base);
    expect(cover.byteLength).toBe(512);

    // 3. 600-character message expands to next bucket (1024 bytes)
    const medium = encodeAppMessage({ ...base, text: "A".repeat(600) });
    expect(medium.byteLength).toBe(1024);

    // 4. Correctly recovers original message payload
    const parsedShort = parseAppMessage(short, "text");
    expect(parsedShort.text).toBe("ping");
    expect(parsedShort.id).toBe("test-id-1");

    const parsedCover = parseAppMessage(cover, "cover");
    expect(parsedCover.id).toBe("test-id-1");
    expect(parsedCover.text).toBeUndefined();
  });

  it("cover traffic silently advances ratchets without breaking subsequent messages", async () => {
    const { alice, bob } = await world({ ratchetEveryK: 4 });

    // Step 1: Initial message (handshake epoch 0)
    const env1 = await send(alice, bob, "hello bob");
    expect(await recv(bob, env1)).toBe("hello bob");

    // Step 2: Send a dummy cover message from Alice to Bob
    const coverMsg: AppMessage = { v: 1, id: "cover-1", sentAt: Date.now() };
    const coverEnv = await alice.sm.encrypt(bob.name, encodeAppMessage(coverMsg), "cover");

    // Ciphertext of cover message is uniformly 512 bytes + 16 bytes tag = 528 bytes
    // In EnvelopeV1 wire JSON, body is base64url-encoded: 528 * 4 / 3 = 704 characters
    expect(fromBase64url(coverEnv.body).length).toBe(528);
    expect(coverEnv.body.length).toBe(704);

    // Bob decrypts the cover envelope
    const decryptedCover = await bob.sm.decrypt(coverEnv);
    expect(decryptedCover.contentType).toBe("cover");
    const parsed = parseAppMessage(decryptedCover.plaintext, "cover");
    expect(parsed.id).toBe("cover-1");

    // Step 3: Subsequent real message from Alice to Bob succeeds on advanced chain
    const env2 = await send(alice, bob, "second real message");
    expect(await recv(bob, env2)).toBe("second real message");

    // Step 4: Bob sends a cover message back to Alice
    const bobCoverMsg: AppMessage = { v: 1, id: "cover-2", sentAt: Date.now() };
    const bobCoverEnv = await bob.sm.encrypt(alice.name, encodeAppMessage(bobCoverMsg), "cover");
    const decryptedBobCover = await alice.sm.decrypt(bobCoverEnv);
    expect(decryptedBobCover.contentType).toBe("cover");

    // Step 5: Bob sends a real message back to Alice
    const env3 = await send(bob, alice, "reply from bob");
    expect(await recv(alice, env3)).toBe("reply from bob");
  });

  it("cover traffic triggers KEM ratchet steps every K messages seamlessly", async () => {
    const { alice, bob } = await world({ ratchetEveryK: 2 });

    // Establish session
    const m0 = await send(alice, bob, "init");
    await recv(bob, m0);
    const r0 = await send(bob, alice, "bob reply");
    await recv(alice, r0);

    // Send 3 cover messages from Alice (crossing K=2 threshold)
    for (let i = 0; i < 3; i++) {
      const cover = await alice.sm.encrypt(
        bob.name,
        encodeAppMessage({ v: 1, id: `cov-${i}`, sentAt: Date.now() }),
        "cover",
      );
      const res = await bob.sm.decrypt(cover);
      expect(res.contentType).toBe("cover");
    }

    // Now send a real message; ratchet must have cleanly stepped
    const mReal = await send(alice, bob, "post-cover message");
    expect(await recv(bob, mReal)).toBe("post-cover message");
  });
});
