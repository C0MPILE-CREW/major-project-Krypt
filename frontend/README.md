# Krypt Frontend

A sovereign, post-quantum end-to-end encrypted messaging client built with **React 19**, **Vite 7**, **Tailwind CSS**, and **TypeScript**. Implements the full **Krypt v1 protocol** ([`docs/protocol/krypt-v1.md`](../docs/protocol/krypt-v1.md)).

```bash
npm install
npm run dev        # Development server (http://localhost:5173)
npm run build      # Production build
npm run lint       # ESLint type and code quality check
npm test           # Vitest unit, protocol, and property tests (272 tests)
npm run test:kat   # NIST ACVP + Wycheproof vector tests
npm run test:e2e   # Playwright end-to-end integration tests (see e2e/README.md)
```

---

## 🔑 Environment Configuration

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | **Yes** | Backend REST and WebSocket origin (e.g. `http://localhost:3000` or production URL) |
| `VITE_KT_LOG_PUBKEY` | Optional | Base64-encoded ML-DSA-87 public key of the Key Transparency log's Signed Tree Heads. Pinned at build time. When omitted, KT operates in local TOFU mode and displays a "KT Disabled" indicator. |
| `VITE_KT_WITNESS_URL` | Optional | Independent witness service URL serving latest cosigned tree heads (`latest.json`). |
| `VITE_KT_WITNESS_PUBKEY` | With URL | Base64-encoded ML-DSA witness key used to verify witness cosignatures. |

---

## 📂 Source Code Architecture

| Path | Purpose & Responsibilities |
|---|---|
| `src/crypto/` | Core cryptographic engine: ML-KEM-1024, ML-DSA-87, HKDF-SHA-256, Krypt-X3K handshake, $K=4$ double ratchet, Vault v2 formats, canonical encoding (`lp`). |
| `src/services/protocol.ts` | Wires the active user's `SessionManager`, encrypted IndexedDB stores, prekeys, and KT verification together. |
| `src/services/messaging.ts` | Complete send/receive message pipeline, in-band auto-healing synchronization, and outbox drain. |
| `src/services/prekeyMaintenance.ts` | SPK weekly rotation with 14-day grace period, OPK replenishment, and cross-device prekey alignment. |
| `src/services/trust.ts` | Key Transparency lookup verification, TOFU public key pinning, and key-change warning prompts. |
| `src/services/kt.ts` | Key Transparency client: Merkle inclusion proofs, STH consistency checks, and P2P STH gossip. |
| `src/components/WireframeModal.tsx` | **Dev Mode Cryptographic WireFrame Inspector**: Live auditing of active ratchet keys, KEM states, AAD bytes, and Merkle tree proofs. |
| `src/components/ChatWindow.tsx` | Message timeline, composer, media attachments, file streaming progress, and inline session notice pills. |
| `src/components/SecurityPanel.tsx` | Safety numbers (60-digit verification codes), identity keys, and Key Transparency audit badges. |
| `src/components/LoginForm.tsx` | SRP-6a augmented PAKE authentication and Vault v2 physical backup upload/restoration. |

---

## 🔒 Storage Security & Non-Extractable Keys

All sensitive cryptographic state (active ratchet sessions, private prekeys, replay memory, and encrypted message caches) is sealed in client-side **IndexedDB** using **AES-256-GCM** under a key derived as:

$$\text{StoreKey} = \text{HKDF-SHA-256}(\text{salt} = \text{"krypt-store-salt-v1"}, \text{ikm} = IK_{\text{DSA, sk}}, \text{info} = \text{lp}(\text{"krypt-store-key-v1"}, \text{username}))$$

The resulting key is imported directly into the Web Crypto engine as a **non-extractable** `CryptoKey`. Browser JavaScript can perform encryption and decryption operations with this key, but the raw underlying key bytes cannot be extracted by malicious third-party scripts or extensions.

---

## ⚡ In-Band Auto-Healing & Session Synchronization

When a client device suffers database eviction, restores a backup, or migrates devices:
1. An incoming message on an unknown epoch triggers `UNKNOWN_SESSION`.
2. Rather than crashing or leaking unencrypted reset frames, the client surfaces an inline session notice:
   `⚡ [Session Notice: Out-of-sync session detected. Re-establishing secure channel...]`
3. The client immediately triggers an in-band Krypt-X3K re-handshake to the peer.
4. Once acknowledged, both devices establish fresh ratchet chains and automatically flush any pending outbox messages under the newly synchronized keys.
