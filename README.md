# 🛡️ Project Krypt: Post-Quantum End-to-End Encrypted Communication Framework

[![Protocol Version](https://img.shields.io/badge/Protocol-Krypt--v1-blue.svg)](docs/protocol/krypt-v1.md)
[![Post-Quantum KEM](https://img.shields.io/badge/KEM-ML--KEM--1024_(FIPS_203)-purple.svg)](https://csrc.nist.gov/pubs/fips/203/final)
[![Post-Quantum Signature](https://img.shields.io/badge/Signature-ML--DSA--87_(FIPS_204)-purple.svg)](https://csrc.nist.gov/pubs/fips/204/final)
[![Zero-Knowledge Auth](https://img.shields.io/badge/Authentication-SRP--6a_(RFC_5054)-green.svg)](https://datatracker.ietf.org/doc/html/rfc5054)
[![Key Transparency](https://img.shields.io/badge/Auditability-RFC_9162_Merkle_Tree-orange.svg)](shared/README.md)
[![Automated Tests](https://img.shields.io/badge/Tests-703_Passing-brightgreen.svg)](frontend/README.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Project Krypt** is a production-grade, Post-Quantum End-to-End Encrypted (E2EE) communication system engineered to provide unbreakable confidentiality, authenticity, and verifiable cryptographic integrity against both classical adversaries and future quantum computers capable of executing Shor's and Grover's algorithms.

Designed around a strict **Zero-Knowledge Blind Relay** architecture, Krypt guarantees that the relay server never possesses user passwords, never sees private cryptographic keys, and cannot decrypt conversation payloads or media. All identity keys, session states, and message caches remain exclusively in sovereign client-side custody.

---

## ⚡ Key Innovations & Capabilities

- **Post-Quantum Cryptographic Suite:** Powered by NIST standardized **ML-KEM-1024** (FIPS 203) for key encapsulation and **ML-DSA-87** (FIPS 204) for digital signatures at NIST Security Category 5 (256-bit quantum security level).
- **Augmented Zero-Knowledge Authentication (SRP-6a):** Implements RFC 5054 / RFC 2945 Secure Remote Password protocol with mutual proof verification ($M_1$ and $M_2$). Passwords are never transmitted over the network; the database stores only an irreversible salt and SRP verifier.
- **Krypt-X3K Asymmetric Handshake:** Asynchronous triple/quad KEM key establishment with Signed Prekeys (SPK) and One-Time Prekeys (OPK), protected against replay attacks and bound by a cryptographically signed transcript hash $H(T)$.
- **$K=4$ Hybrid Post-Quantum Double Ratchet:** Combines symmetric HKDF-SHA-256 chain steps per message with an asymmetric ML-KEM-1024 ratchet stride of $K=4$, achieving optimal latency, low bandwidth overhead, and rapid post-compromise self-healing.
- **Verifiable Key Transparency (KT):** Append-only RFC 6962 / RFC 9162 Merkle tree log tracking all public key operations, verifiable Signed Tree Heads (STH), independent witness cosigners, $O(\log N)$ inclusion proofs, and real-time Peer-to-Peer (P2P) STH gossip to thwart provider-side split-view attacks.
- **In-Band Auto-Healing Synchronization:** Zero-leakage automatic recovery mechanism resolving `UNKNOWN_SESSION` and session race conditions without unencrypted acknowledgments, backed by an encrypted outbox re-send queue and inline session notices.
- **Vault v2 Portable Physical Identity:** Export and import complete sovereign identities as password-encrypted physical `.vault` files (PBKDF2-HMAC-SHA-256 with 600,000 iterations + AES-256-GCM). Supports multi-device migration including full SPK/OPK prekey stores, replay memory, and automatic server prekey reconciliation.
- **Blind Memory Routing & Strict Quotas:** WebSocket relay operating purely in-memory; quota-enforced offline mailbox (at most 7 days, 500 messages, 50 MB per recipient) with atomic database purge upon client delivery or mailbox toggle off.
- **In-Flight Chunked Streaming:** High-performance encrypted file transfer supporting files up to 256 MiB streamed in 1 MiB AES-256-GCM chunks over ephemeral random per-file keys, with zero server-side disk writes.
- **Dev Mode & Cryptographic WireFrame Inspector:** In-browser cryptographic auditing suite enabling developers and auditors to inspect live ratchet states, KEM keys, AAD headers, safety numbers, and Merkle tree inclusion proofs.

---

## 🗺️ System Architecture

### 1. High-Level Infrastructure

Krypt divides responsibilities across four distinct architectural domains: the sovereign React client runtime, the stateless blind WebSocket/REST relay, the relational database store, and the independent Key Transparency witness.

```mermaid
flowchart TB
    subgraph Client_Alice ["Alice's Sovereign Client (Vercel)"]
        UI_A["React 19 UI & Dev WireFrame Inspector"]
        AES_A["Web Crypto AES-256-GCM Engine"]
        PQ_A["Post-Quantum Engine (ML-KEM-1024 / ML-DSA-87)"]
        STORE_A[("IndexedDB (Encrypted Sessions, Vault & Prekeys)")]
    end

    subgraph Backend ["Blind Relay & Services (Render.com)"]
        API["Express REST API (SRP-6a, Prekeys, KT Endpoints)"]
        WS["Socket.io Real-Time Router (Pure RAM Relay)"]
        MBOX["Offline Mailbox (Quota Enforcement & Atomic Purge)"]
    end

    subgraph Database ["Relational Database (Neon PostgreSQL)"]
        PG[("PostgreSQL Serverless Cluster")]
        TABLES["Users, Prekeys, Social Graph & Merkle KT Log"]
    end

    subgraph WitnessNode ["Independent Key Transparency Witness"]
        WITNESS["Witness Auditor (STH Verification & ML-DSA Cosigning)"]
    end

    subgraph Client_Bob ["Bob's Sovereign Client (Vercel)"]
        UI_B["React 19 UI & Dev WireFrame Inspector"]
        AES_B["Web Crypto AES-256-GCM Engine"]
        PQ_B["Post-Quantum Engine (ML-KEM-1024 / ML-DSA-87)"]
        STORE_B[("IndexedDB (Encrypted Sessions, Vault & Prekeys)")]
    end

    %% Alice internal flows
    UI_A <-->|"Import / Decrypt Vault"| PQ_A
    UI_A <-->|"Encrypt / Decrypt Messages"| AES_A
    AES_A <-->|"Persist Ciphertext at Rest"| STORE_A

    %% Bob internal flows
    UI_B <-->|"Import / Decrypt Vault"| PQ_B
    UI_B <-->|"Encrypt / Decrypt Messages"| AES_B
    AES_B <-->|"Persist Ciphertext at Rest"| STORE_B

    %% Network flows
    UI_A <-->|"1. SRP-6a Auth & KT Proof Queries"| API
    UI_A <-->|"2. Ephemeral E2EE Messages & Media Chunks"| WS
    UI_B <-->|"1. SRP-6a Auth & KT Proof Queries"| API
    UI_B <-->|"2. Ephemeral E2EE Messages & Media Chunks"| WS

    %% Backend to Storage & Witness
    API <-->|"Prisma ORM Queries"| TABLES
    TABLES --- PG
    WS <-->|"Queue / Flush Offline Messages"| MBOX
    MBOX <-->|"Transient Storage & Deletion"| PG
    API <-->|"Publish Signed Tree Heads (STH)"| WITNESS
    UI_A -.->|"Audit Witness Cosignatures"| WITNESS
    UI_B -.->|"Audit Witness Cosignatures"| WITNESS
```

---

### 2. Krypt-X3K Initial Handshake Protocol

The **Krypt-X3K** handshake provides asynchronous post-quantum forward secrecy and mutual identity authentication using a triple/quad KEM encapsulation pattern with bound transcript hashing.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as "Alice (Initiator)"
    participant Relay as "Blind Relay Server"
    actor Bob as "Bob (Recipient)"

    Note over Alice, Relay: Phase 1: Prekey Acquisition & Verification
    Alice->>Relay: GET /api/prekeys/bundle/Bob
    Relay-->>Alice: Bob's Bundle (IK_DSA, SPK_KEM, SPK Sig, OPK_KEM, OPK_ID)
    Note over Alice: 1. Verify Bob's SPK Signature with Bob's IK_DSA<br/>2. Audit Bob's IK in Key Transparency Log (RFC 9162 Proof)

    Note over Alice, Relay: Phase 2: Krypt-X3K Post-Quantum Encapsulation
    Note over Alice: 1. Generate Ephemeral KeyPair (EK_A)<br/>2. ss1 = Encapsulate(Bob_SPK)<br/>3. ss2 = Encapsulate(Bob_OPK)<br/>4. Build Transcript: T = lp("Krypt-v1", Alice, Bob, keys...)<br/>5. Sign: sigma_A = ML-DSA-87-Sign(IK_A, H(T))<br/>6. Derive: RK0, CK0 = HKDF(ss1 || ss2, salt, "Krypt-X3K")
    
    Alice->>Relay: POST Message Frame (Ciphertext, EK_A, SPK_ID, OPK_ID, sigma_A)
    Relay->>Bob: Forward Handshake Frame (Real-Time RAM or Mailbox)

    Note over Bob: Phase 3: Decapsulation & Verification
    Note over Bob: 1. Retrieve Bob_SPK private key & Bob_OPK private key<br/>2. Verify sigma_A over H(T) using Alice's IK_DSA<br/>3. ss1 = Decapsulate(ct_spk, Bob_SPK_SK)<br/>4. ss2 = Decapsulate(ct_opk, Bob_OPK_SK)<br/>5. Derive identical RK0, CK0 = HKDF(ss1 || ss2, salt, "Krypt-X3K")<br/>6. Atomically delete consumed OPK private key from storage!

    Note over Alice, Bob: Mutual Post-Quantum Secure Session Active (Epoch 0)
```

---

### 3. The $K=4$ Hybrid Post-Quantum Double Ratchet

To balance quantum post-compromise security with bandwidth and compute efficiency, Krypt employs a double ratchet where symmetric chain steps occur per message and an asymmetric ML-KEM-1024 ratchet stride occurs every $K=4$ messages.

```mermaid
flowchart TD
    subgraph SymmetricRatchet ["Symmetric Chain Step (Per Message)"]
        CK_i["Current Chain Key (CK_i)"]
        HMAC1["HMAC-SHA-256 (Constant 0x01)"]
        HMAC2["HMAC-SHA-256 (Constant 0x02)"]
        MK["Message Key (MK) + 96-bit IV"]
        CK_next["Next Chain Key (CK_i+1)"]
        CIPHER["AES-256-GCM Encrypt/Decrypt (Associated Data AAD)"]

        CK_i --> HMAC1
        CK_i --> HMAC2
        HMAC1 --> MK
        HMAC2 --> CK_next
        MK --> CIPHER
    end

    subgraph AsymmetricRatchet ["Asymmetric KEM Step (Stride K=4 Messages)"]
        Trigger{"Stride Check: Sent == 4 or Received New Peer Key?"}
        Gen["Generate Fresh ML-KEM-1024 Ephemeral Pair (ek_new, dk_new)"]
        Encap["Encapsulate against Peer's Latest Ephemeral Key: ss_new"]
        KDF_RK["HKDF Root Step: RK_next, CK_send = KDF(RK, ss_new, 'Krypt-RK')"]
        Retire["Zeroize & Wipe Old Secret Keys (dk_old)"]

        Trigger -->|"Yes (K=4 Stride Met)"| Gen
        Gen --> Encap
        Encap --> KDF_RK
        KDF_RK --> Retire
    end

    CIPHER --> Trigger
    KDF_RK --> CK_i
```

---

### 4. Key Transparency Audit & P2P Gossip Flow

Key Transparency eliminates reliance on Trust-On-First-Use (TOFU) by maintaining an append-only RFC 9162 Merkle tree of all identity keys, cosigned by independent witnesses and continuously verified by clients through P2P STH gossip.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as "Alice (Client)"
    participant Relay as "KT Log / Server"
    participant Witness as "Independent Witness"
    actor Bob as "Bob (Client)"

    Note over Alice, Relay: Phase 1: Identity Registration & Tree Append
    Alice->>Relay: POST /kt/register (User, IK_DSA, IK_KEM, Owner_Sig)
    Relay->>Relay: 1. Append Leaf to Merkle Tree<br/>2. Recompute Merkle Root Hash R_new<br/>3. Sign Tree Head: STH_new = ML-DSA-87-Sign(R_new, TreeSize)

    Note over Relay, Witness: Phase 2: Witness Auditing & Cosigning
    Relay->>Witness: POST /witness/cosign (STH_new, Consistency Proof)
    Note over Witness: 1. Verify consistency with previously signed STH<br/>2. Verify append-only property and tree bounds<br/>3. Cosign STH with Witness ML-DSA key
    Witness-->>Relay: Return Cosigned STH

    Note over Alice, Bob: Phase 3: Cryptographic Audit & P2P Gossip
    Alice->>Relay: GET /kt/lookup/Bob
    Relay-->>Alice: Bob's Leaf, STH, and Merkle Inclusion Proof
    Note over Alice: Verify inclusion proof against STH<br/>Verify Log & Witness signatures

    Alice->>Bob: WebRTC / WebSocket P2P Gossip (Alice's latest STH)
    Note over Bob: 1. Compare Alice's STH with Bob's known STH<br/>2. Check consistency proof between STHs<br/>3. Any divergence detects split-view attack immediately!
```

---

### 5. Vault v2 Portable Identity & Cross-Device Migration

Vault v2 enables complete sovereign identity portability across devices without causing `UNKNOWN_PREKEY` or session decryption failures.

```mermaid
flowchart TD
    subgraph DeviceA ["Device A (Source Device)"]
        LocalStoreA[("IndexedDB PrekeyStore & SessionStore")]
        VaultExport["Vault v2 Exporter (crypto/vault.ts)"]
        EncAES["PBKDF2-HMAC-SHA-256 (600k iter) + AES-256-GCM"]
        VaultFile[".vault File (Encrypted Physical Download)"]

        LocalStoreA -->|"Extract IK, SPK, OPK private keys, replay memory"| VaultExport
        VaultExport -->|"User Password Encryption"| EncAES
        EncAES --> VaultFile
    end

    subgraph UserTransfer ["Air-Gapped Sovereign Transfer"]
        VaultFile -->|"USB Drive / Local File Transfer"| RestoreForm
    end

    subgraph DeviceB ["Device B (Target Device)"]
        RestoreForm["Login & Vault Import Form"]
        DecAES["AES-256-GCM Decrypt (Vault Password)"]
        LocalStoreB[("IndexedDB PrekeyStore & SessionStore")]
        PrekeySync["Prekey Maintenance & Auto-Refill (services/prekeyMaintenance.ts)"]

        RestoreForm --> DecAES
        DecAES -->|"Import IK, SPK, OPK private keys & replay memory"| LocalStoreB
        LocalStoreB --> PrekeySync
        PrekeySync -->|"Verify Server Prekeys & Replenish Exhausted OPKs"| ServerSync["Primary Backend Prekey Registry"]
    end
```

---

### 6. In-Band Auto-Healing Synchronization

When a client loses session state (such as after clearing browser storage or importing a fresh vault), Krypt detects `UNKNOWN_SESSION` and auto-heals synchronization in-band without plaintext acknowledgments.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as "Alice (Peer)"
    participant Relay as "Blind Relay Server"
    actor Bob as "Bob (Device Restored / Lost Session)"

    Alice->>Relay: Transmit Encrypted Message (Epoch E, Seq N)
    Relay->>Bob: Forward Ciphertext Frame

    Note over Bob: 1. Decryption fails: UNKNOWN_SESSION<br/>2. Surface non-blocking inline session notice<br/>3. Suppress raw error toasts & initiate auto-healing
    
    Bob->>Relay: Initiate Fresh Krypt-X3K Handshake to Alice
    Relay->>Alice: Forward In-Band Handshake Frame
    
    Note over Alice: 1. Alice accepts Bob's handshake & establishes new session<br/>2. Surface inline notice: '⚡ [Session Notice: Synchronized]'<br/>3. Automatically drain outbox and re-send unacknowledged messages!

    Alice->>Relay: Re-transmit Queued Outbox Messages under Fresh Ratchet
    Relay->>Bob: Forward Freshly Encrypted Frames
    Note over Bob: Decrypt messages cleanly & render complete timeline!
```

---

## 🧮 Technical Specifications & Protocols

### 1. Cryptographic Primitive Suite

| Function | Algorithm / Standard | Specification | Security Margin |
|---|---|---|---|
| **Identity Signatures** | ML-DSA-87 (FIPS 204) | Public: 2592 B, Secret: 4896 B, Sig: 4627 B | NIST Security Category 5 (Quantum-Safe) |
| **Key Encapsulation** | ML-KEM-1024 (FIPS 203) | Encapsulation Key: 1568 B, Ciphertext: 1568 B, Secret Key: 3168 B, Shared Secret: 32 B | NIST Security Category 5 (Quantum-Safe) |
| **Augmented PAKE** | SRP-6a (RFC 5054) | 2048-bit prime group, SHA-256 hashing | Zero password transmission; resistant to offline dictionary attacks |
| **Symmetric Encryption** | AES-256-GCM | 256-bit key, 96-bit random IV, 128-bit authentication tag | Native Web Crypto API (`window.crypto.subtle`) |
| **Key Derivation** | HKDF-SHA-256 (RFC 5869) | HMAC-SHA-256 extract-and-expand with domain separation labels | Cryptographic pseudorandom key expansion |
| **Vault Encryption** | PBKDF2 + AES-256-GCM | 600,000 SHA-256 iterations, 128-bit salt, AES-256-GCM | Hardware-hardened against GPU brute force |
| **Merkle Tree Log** | RFC 6962 / RFC 9162 | SHA-256 leaf and internal node hashing | Collision-resistant append-only proof system |

### 2. Injective Canonical Encoding (`lp(...)`)

To prevent ambiguous boundary vulnerabilities such as the canonical parsing injections historically observed in standard PQXDH, Krypt enforces a strict length-prefixed encoding for every composite structure:

$$\text{lp}(x_1, x_2, \dots, x_k) = \text{u32be}(\text{len}(x_1)) \parallel x_1 \parallel \text{u32be}(\text{len}(x_2)) \parallel x_2 \parallel \dots \parallel \text{u32be}(\text{len}(x_k)) \parallel x_k$$

Where $\text{u32be}(x)$ is the 4-byte big-endian unsigned integer. Every field is length-delimited, guaranteeing injective parsing across all operational envelopes.

### 3. Transcript Hash Binding

The Krypt-X3K handshake binds the full context of both communicating parties into a single immutable transcript $T$:

$$T = \text{lp}(\text{"Krypt-v1"}, \text{senderUsername}, \text{recipientUsername}, IK_A, IK_B, SPK_B, OPK_B, EK_A)$$

The initiator calculates $H(T) = \text{SHA-256}(T)$ and signs it using ML-DSA-87:

$$\sigma_A = \text{ML-DSA-87-Sign}(IK_{A,\text{priv}}, \text{lp}(\text{"Krypt-init"}, H(T)))$$

This signature binds the initiator's long-term identity to the recipient's prekeys and the ephemeral key, completely preventing handshake replay and identity misbinding attacks.

---

## 📂 Repository Directory Structure

```plaintext
major-project-Krypt/
├── docs/                             # Protocol specifications and formal models
│   ├── protocol/krypt-v1.md          # Definitive Krypt v1 normative specification
│   └── protocol/proverif/            # Symbolic security verification models
├── shared/                           # @krypt/shared: Zero-dependency KT & Merkle library
│   ├── src/merkle.ts                 # RFC 9162 Merkle tree, inclusion & consistency proofs
│   ├── src/leaf.ts                   # KT leaf canonical encoding, hashing, owner signatures
│   ├── src/sth.ts                    # Signed Tree Head formatting and witness verification
│   └── src/gossip.ts                 # P2P STH gossip comparison & divergence detection
├── frontend/                         # React 19 + Vite 7 sovereign client application
│   ├── src/crypto/                   # Cryptographic engine
│   │   ├── pq.ts                     # ML-KEM-1024 & ML-DSA-87 wrappers (@noble/post-quantum)
│   │   ├── kdf.ts                    # HKDF-SHA-256 key schedule & AES-256-GCM
│   │   ├── handshake.ts              # Krypt-X3K handshake initiation & response
│   │   ├── session.ts                # SessionManager (K=4 double ratchet state machine)
│   │   ├── session-store.ts          # Encrypted IndexedDB session & prekey persistence
│   │   ├── prekeys.ts                # SPK / OPK generation, verification, and rotation
│   │   ├── envelope.ts               # Binary header codec and AAD authentication
│   │   └── vault.ts                  # Vault v2 format: PBKDF2 + AES-GCM physical backups
│   ├── src/services/                 # Orchestration services
│   │   ├── protocol.ts               # Wires SessionManager, stores, prekeys, and KT together
│   │   ├── messaging.ts              # Send/receive pipelines, auto-healing, outbox drain
│   │   ├── prekeyMaintenance.ts      # SPK weekly rotation, OPK refill, stale key withdrawal
│   │   ├── kt.ts                     # KT client: proofs, consistency checks, P2P gossip
│   │   └── trust.ts                  # TOFU pinning and security level evaluation
│   └── src/components/               # UI components
│       ├── ChatWindow.tsx            # Message timeline, composer, session notice pills
│       ├── WireframeModal.tsx        # Dev Mode Cryptographic WireFrame Inspector
│       ├── SecurityPanel.tsx         # Safety numbers, active ratchet keys, KT badge
│       └── LoginForm.tsx             # SRP-6a login and Vault v2 file restoration
├── primary-backend/                  # Express + Socket.io blind relay service
│   ├── src/server.ts                 # HTTP & WebSocket initialization
│   ├── src/sockets.ts                # Real-time ephemeral RAM message routing
│   ├── src/mailbox.ts                # Offline mailbox: TTL, quota enforcement, atomic purge
│   ├── src/prekeys.ts                # Prekey bundle storage and OPK atomic claim API
│   ├── src/kt.ts, ktRoutes.ts        # Merkle tree log endpoints and STH publishing
│   └── prisma/schema.prisma          # PostgreSQL schema definitions
├── witness/                          # Independent Key Transparency witness service
│   └── witness.mjs                   # Standalone auditor validating STHs and cosigning
├── flow.md                           # Comprehensive v1 protocol lifecycle walkthrough
└── README.md                         # Project documentation and architectural manual
```

---

## 🚀 Getting Started Locally

### 1. Prerequisites
- **Node.js:** v20.12.0 or higher
- **PostgreSQL:** Local instance or a serverless [Neon.tech](https://neon.tech) database
- **Package Manager:** `npm` (v10+)

### 2. Clone the Repository
```bash
git clone https://github.com/C0MPILE-CREW/major-project-Krypt.git
cd major-project-Krypt
```

### 3. Backend Setup
Navigate to the backend directory, install dependencies, and configure environment variables:
```bash
cd primary-backend
npm install
```

Create a `.env` file in `primary-backend/`:
```env
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/krypt?sslmode=prefer"
DIRECT_URL="postgresql://username:password@localhost:5432/krypt?sslmode=prefer"
JWT_SECRET="your-development-jwt-hmac-secret-min-32-chars"
CORS_ORIGIN="http://localhost:5173"
NODE_ENV="development"
```

Apply database migrations:
```bash
npx prisma db push
```

Start the backend service:
```bash
npm run dev
```

### 4. Frontend Setup
Open a separate terminal, navigate to the frontend directory, install dependencies:
```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:
```env
VITE_API_URL="http://localhost:3000"
```

Start the Vite development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Comprehensive Verification & Test Suites

The Krypt codebase is protected by **703 automated unit, integration, protocol, and property tests** across all workspaces:

```bash
# 1. Run Shared Library Tests (Merkle Trees, KT Proofs, Gossip)
npm --prefix shared test

# 2. Run Backend Tests (SRP-6a, Prekeys, Mailbox, Blind Router, KT)
npm --prefix primary-backend test

# 3. Run Frontend Tests (Krypt-X3K, K=4 Double Ratchet, Vault v2, Auto-Healing)
npm --prefix frontend test

# 4. Run Known-Answer Tests (NIST ACVP & Project Wycheproof Vectors)
npm --prefix frontend run test:kat
```

### Summary of Passing Automated Test Suites

| Workspace | Test Suite Coverage | Passing Tests |
|---|---|---|
| `@krypt/shared` | Merkle tree hashing, RFC 9162 proofs, KT leaf encoding, STH chain checks, gossip | **294 / 294** |
| `primary-backend` | SRP-6a auth, prekey bundles, mailbox quotas/purge, CORS preflight, KT routes | **137 / 137** |
| `frontend` | Krypt-X3K handshake, $K=4$ ratchet, Vault v2 serialization, auto-healing, UI components | **272 / 272** |
| **Total** | **Comprehensive end-to-end cryptographic and system verification** | **703 / 703** |

---

## 🛡️ Security Architecture & Comparison

| Security Capability | Classical E2EE (e.g. Signal X3DH) | Legacy Krypt (v0) | **Project Krypt (v1)** |
|---|---|---|---|
| **Quantum Resistance (KEM)** | ❌ None (ECDH Curve25519) | ⚠️ Static ML-KEM-1024 | **✅ Ephemeral ML-KEM-1024 (FIPS 203)** |
| **Quantum Signatures** | ❌ None (Ed25519 / ECDSA) | ⚠️ ML-DSA-87 (Handshake only) | **✅ ML-DSA-87 (FIPS 204, Prekeys, Handshake & KT)** |
| **Ratchet Mechanism** | Classical Double Ratchet | Single symmetric chain | **✅ $K=4$ Hybrid Post-Quantum Double Ratchet** |
| **Server Authentication** | Plaintext / Salted Hash | SRP-6a PAKE | **✅ SRP-6a (RFC 5054) with Mutual Server Proof** |
| **Key Transparency** | Proprietary Auditing / None | None (TOFU only) | **✅ RFC 9162 Merkle Tree + P2P STH Gossip** |
| **Session Auto-Healing** | Plaintext Signal Reset Frames | Manual re-initiation | **✅ In-Band Auto-Healing (Zero Leakage)** |
| **Identity Portability** | Phone number / Cloud link | Raw memory keys | **✅ Sovereign Vault v2 (SPK/OPK Prekeys & Replay Memory)** |
| **Server Plaintext Storage** | ❌ Zero | ❌ Zero | **❌ Zero (RAM Blind Relay & Atomic Purge)** |

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

### 🎓 Academic Capstone Project

**Developed as a Bachelor of Technology Major Capstone Project**  
*Department of Computer Science and Engineering*  
**Indian Institute of Information Technology, Bhopal (M.P.)**

**Project Supervisor:**
- **Dr. Sonal Chandel Ma'am** (Assistant Professor, Department of CSE, IIIT Bhopal)

**Engineered by:**
- **Abhinav Singh Sengar** (Scholar Number: 23U02142)
- **Anchal Jain** (Scholar Number: 23U02144)
