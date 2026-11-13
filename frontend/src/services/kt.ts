/**
 * Key transparency client (plan 3.1-3.3), built on shared/ (imported as
 * `@krypt/shared`, see vite.config.ts).
 *
 * Trust anchors are compiled in, never fetched:
 *   VITE_KT_LOG_PUBKEY       base64 ML-DSA-87 public key of the log's tree heads.
 *                            Unset -> KT runs in "disabled" mode (TOFU only) and
 *                            the UI shows a warning badge.
 *   VITE_KT_WITNESS_URL      optional: the witness's latest.json (GitHub Pages).
 *   VITE_KT_WITNESS_PUBKEY   base64 ML-DSA-44 witness key; required to use the URL.
 *
 * What the client checks:
 *   - lookup (before a peer identity is trusted): inclusion proof, STH
 *     signature, leaf owner/key match, owner signature of register leaves,
 *     version not older than the one already seen, and consistency of the STH
 *     with the last STH this device stored (and with the witness head);
 *   - self-monitoring (on login): every leaf appended since the last check is
 *     fetched (paged), authenticated against the signed root, and scanned for
 *     keys under my name that I did not publish;
 *   - gossip: my (treeSize, rootHash) travels inside every encrypted message;
 *     a peer's head that is inconsistent with mine is a fork.
 * Any failed check raises a sticky ALERT.
 *
 * Local state (public data only) is in localStorage `krypt_kt_<user>`.
 */
import {
  CompactRange,
  KtOp,
  attachOwnerSig,
  buildLeafBody,
  bytesEqual,
  checkSthChain,
  cosignatureFromJson,
  encodeLeaf,
  fromBase64,
  hashUsername,
  logIdFromPublicKey,
  ownerSignedMessage,
  parseConsistencyResponse,
  parseLeavesResponse,
  parseLookupResponse,
  selfMonitor,
  sha256,
  sthFromJson,
  sthToJson,
  toBase64,
  verifyCosignature,
  verifyLeafRange,
  verifyLookup,
  verifyTreeHead,
  type CheckResult,
  type KnownKey,
  type LeafEntry,
  type SignedTreeHead,
  type SignedTreeHeadJson,
  type TreeHead,
} from "@krypt/shared";
import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import type { UserIdentityKeys } from "../crypto/mlkem";
import { mldsaSign, mldsaVerify } from "../crypto/pq";
import { apiFetch, apiPostJson } from "./api";

function envKey(name: string): Uint8Array | null {
  const v = (import.meta.env as Record<string, string | undefined>)[name]?.trim();
  if (!v) return null;
  try {
    return fromBase64(v);
  } catch {
    console.error(`[KT] ${name} is not valid base64; ignoring it.`);
    return null;
  }
}

export const DEFAULT_KT_LOG_PUBKEY_B64 =
  "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";

const explicitEnvKey = envKey("VITE_KT_LOG_PUBKEY");
const LOG_PUBKEY =
  (import.meta.env as Record<string, string | undefined>).VITE_KT_LOG_PUBKEY === "disabled" ||
  (import.meta.env as Record<string, string | undefined>).VITE_KT_LOG_PUBKEY === "none"
    ? null
    : (explicitEnvKey ?? fromBase64(DEFAULT_KT_LOG_PUBKEY_B64));

const WITNESS_URL = (import.meta.env.VITE_KT_WITNESS_URL as string | undefined)?.trim() || null;
const WITNESS_PUBKEY = envKey("VITE_KT_WITNESS_PUBKEY");
const ML_DSA_87_PK = 2592;
const ML_DSA_44_PK = 1312;
const WITNESS_CACHE_MS = 10 * 60 * 1000;
const WITNESS_STALE_MS = 24 * 60 * 60 * 1000;
const MAX_LEAF_PAGES = 1000;

export const KT_ENABLED = LOG_PUBKEY !== null && LOG_PUBKEY.length === ML_DSA_87_PK;
if (LOG_PUBKEY && !KT_ENABLED) console.error("[KT] VITE_KT_LOG_PUBKEY is not a 2592-byte ML-DSA-87 key; KT disabled.");

// ---------------------------------------------------------------------------
// Observable status (for the badge and the Security panel)

export type KtGlobalState =
  | { mode: "disabled" }
  | { mode: "pending" }
  | { mode: "ok"; treeSize: number; witness: "verified" | "stale" | "none"; self: "logged" | "pending" }
  | { mode: "unavailable"; reason: string }
  | { mode: "error"; reason: string }
  | { mode: "alert"; reason: string };

export type KtPeerState =
  | { state: "disabled" }
  | { state: "verified"; keyVersion: number; treeSize: number; at: number }
  | { state: "not-in-log"; at: number }
  | { state: "error"; reason: string; at: number }
  | { state: "alert"; reason: string; at: number };

let globalState: KtGlobalState = KT_ENABLED ? { mode: "pending" } : { mode: "disabled" };
const peerStates = new Map<string, KtPeerState>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeKt(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function ktVersion(): number {
  return version;
}
export function getKtState(): KtGlobalState {
  return globalState;
}
export function getKtPeerState(peer: string): KtPeerState {
  if (!KT_ENABLED) return { state: "disabled" };
  return peerStates.get(peer) ?? { state: "error", reason: "not checked yet", at: 0 };
}

function setGlobal(s: KtGlobalState) {
  // An alert is sticky for the page's lifetime.
  if (globalState.mode === "alert" && s.mode !== "alert") return;
  globalState = s;
  emit();
}

// ---------------------------------------------------------------------------
// HTTP

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`GET ${path}: HTTP ${status}`);
    this.status = status;
  }
}

async function getJson(path: string): Promise<unknown> {
  const res = await apiFetch(path, { cache: "no-store" });
  if (!res.ok) throw new HttpError(res.status, path);
  return res.json();
}

// ---------------------------------------------------------------------------
// Persistent state

interface Persisted {
  lastSth: SignedTreeHeadJson | null;
  /** Leaves [0, size) have been self-monitored; root is the signed root at size. */
  monitored: { size: number; root: string } | null;
  peers: Record<string, { keyVersion: number }>;
  alert: string | null;
  /** My own leaf has been seen under a signed head. */
  selfLogged?: boolean;
}

const stateKey = (user: string) => `krypt_kt_${user}`;

function loadPersisted(user: string): Persisted {
  try {
    const p = JSON.parse(localStorage.getItem(stateKey(user)) ?? "null");
    if (p && typeof p === "object") {
      return {
        lastSth: p.lastSth ?? null,
        monitored: p.monitored ?? null,
        peers: p.peers ?? {},
        alert: p.alert ?? null,
        selfLogged: p.selfLogged === true,
      };
    }
  } catch {
    // fall through
  }
  return { lastSth: null, monitored: null, peers: {}, alert: null };
}

// ---------------------------------------------------------------------------

const verifySth = (msg: Uint8Array, sig: Uint8Array) => (LOG_PUBKEY ? mldsaVerify(LOG_PUBKEY, msg, sig) : false);
const verifyOwner = (msg: Uint8Array, sig: Uint8Array, pk: Uint8Array) => mldsaVerify(pk, msg, sig);

export class KtClient {
  readonly username: string;
  private readonly keys: UserIdentityKeys;
  private st: Persisted;
  private lastSth: SignedTreeHead | null;
  private myKeyVersion = 1;
  private witnessCheckedAt = 0;
  private witnessResult: "verified" | "stale" | "none" = "none";
  private gossipChecked = new Set<string>();
  /**
   * "pending" until my own leaf is visible under a signed head. The log
   * publishes heads lazily (up to 5 minutes), so a fresh leaf is not an alert.
   */
  private selfState: "logged" | "pending" = "pending";

  constructor(username: string, keys: UserIdentityKeys) {
    this.username = username;
    this.keys = keys;
    this.st = loadPersisted(username);
    this.lastSth = null;
    try {
      this.lastSth = this.st.lastSth ? sthFromJson(this.st.lastSth) : null;
    } catch {
      this.lastSth = null;
    }
    if (this.st.selfLogged) this.selfState = "logged";
    if (this.st.alert) {
      globalState = { mode: "alert", reason: this.st.alert };
      emit();
    }
  }

  get enabled() {
    return KT_ENABLED;
  }

  private save() {
    try {
      localStorage.setItem(stateKey(this.username), JSON.stringify(this.st));
    } catch {
      // Storage unavailable: checks still run, but state does not persist.
    }
  }

  private raiseAlert(reason: string) {
    console.error(`[KT] ALERT: ${reason}`);
    this.st.alert = reason;
    this.save();
    setGlobal({ mode: "alert", reason });
  }

  /** Records a failure that is not evidence of an attack (log unreachable, register refused). */
  noteError(reason: string) {
    if (!this.enabled) return;
    console.warn(`[KT] ${reason}`);
    setGlobal({ mode: "error", reason });
  }

  /** The head carried as gossip inside encrypted messages. */
  gossip(): { treeSize: number; rootHash: string } | undefined {
    if (!this.enabled || !this.lastSth) return undefined;
    return { treeSize: this.lastSth.treeSize, rootHash: toBase64(this.lastSth.rootHash) };
  }

  /** Consistency between two heads, whichever is larger. */
  private async linkHeads(a: TreeHead, b: TreeHead): Promise<CheckResult> {
    const [small, large] = a.treeSize <= b.treeSize ? [a, b] : [b, a];
    let proof: Uint8Array[] = [];
    if (small.treeSize > 0 && small.treeSize < large.treeSize) {
      const r = parseConsistencyResponse(await getJson(`/kt/consistency?from=${small.treeSize}&to=${large.treeSize}`));
      if (r.from !== small.treeSize || r.to !== large.treeSize) {
        return { ok: false, kind: "inconsistent", reason: "consistency proof is for different sizes" };
      }
      proof = r.proof;
    }
    return checkSthChain(small, large, proof);
  }

  /**
   * Accepts a signature-checked head: it must be consistent with the last head
   * this device stored and with the witness head. The larger one is kept.
   */
  private async acceptSth(sth: SignedTreeHead): Promise<boolean> {
    if (this.lastSth) {
      const link = await this.linkHeads(this.lastSth, sth);
      if (!link.ok) {
        this.raiseAlert(`log ${link.kind}: ${link.reason}`);
        return false;
      }
    }
    if (!(await this.checkWitness(sth))) return false;
    if (!this.lastSth || sth.treeSize > this.lastSth.treeSize) {
      this.lastSth = sth;
      this.st.lastSth = sthToJson(sth);
      this.save();
    }
    setGlobal({ mode: "ok", treeSize: this.lastSth!.treeSize, witness: this.witnessResult, self: this.selfState });
    return true;
  }

  private async checkWitness(sth: SignedTreeHead): Promise<boolean> {
    if (!WITNESS_URL) return true;
    if (!WITNESS_PUBKEY || WITNESS_PUBKEY.length !== ML_DSA_44_PK) {
      if (this.witnessCheckedAt === 0) console.warn("[KT] VITE_KT_WITNESS_URL is set without a valid VITE_KT_WITNESS_PUBKEY; witness not used.");
      this.witnessCheckedAt = Date.now();
      return true;
    }
    if (Date.now() - this.witnessCheckedAt < WITNESS_CACHE_MS) return true;
    let latest: { sth?: unknown; cosignature?: unknown };
    try {
      const res = await fetch(WITNESS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      latest = await res.json();
    } catch (err) {
      // An unreachable witness is not evidence of an attack.
      console.warn("[KT] witness unreachable:", err);
      return true;
    }
    try {
      const wSth = sthFromJson(latest.sth);
      const cosig = cosignatureFromJson(latest.cosignature);
      if (!(await verifyTreeHead(wSth, verifySth))) throw new Error("witness head is not signed by the pinned log key");
      const logId = await logIdFromPublicKey(LOG_PUBKEY!);
      const ok = await verifyCosignature(wSth, logId, cosig, (m, s) => ml_dsa44.verify(s, m, WITNESS_PUBKEY));
      if (!ok) throw new Error("witness cosignature does not verify");
      const link = await this.linkHeads(wSth, sth);
      if (!link.ok) {
        this.raiseAlert(`log head disagrees with the witness (${link.kind}): ${link.reason}`);
        return false;
      }
      this.witnessResult = Date.now() - cosig.timestampMs > WITNESS_STALE_MS ? "stale" : "verified";
      this.witnessCheckedAt = Date.now();
      return true;
    } catch (err) {
      console.warn("[KT] witness head rejected:", err);
      return true;
    }
  }

  /** GET /kt/sth, verified and linked to the stored head. */
  async refreshHead(): Promise<SignedTreeHead | null> {
    if (!this.enabled) return null;
    const sth = sthFromJson(await getJson("/kt/sth"));
    if (!(await verifyTreeHead(sth, verifySth))) {
      this.raiseAlert("tree head signature does not verify under the pinned log key");
      return null;
    }
    return (await this.acceptSth(sth)) ? sth : null;
  }

  /** Registers my identity key in the log if it is not there yet (owner-signed register leaf). */
  async registerSelf(): Promise<void> {
    if (!this.enabled) return;
    const res = await apiFetch("/api/kt/status");
    if (!res.ok) throw new Error(`KT status failed (HTTP ${res.status})`);
    const status = (await res.json()) as { hasLeaf?: boolean; keyVersion?: number };
    if (status.hasLeaf) {
      this.myKeyVersion = Number(status.keyVersion) || 1;
      return;
    }
    const body = await buildLeafBody({
      op: KtOp.Register,
      username: this.username,
      keyVersion: 1,
      mldsaPk: this.keys.dsaPublicKey,
      mlkemPk: this.keys.kemPublicKey,
      timestampMs: Date.now(),
    });
    const ownerSig = mldsaSign(this.keys.dsaSecretKey, ownerSignedMessage(body));
    const leaf = await attachOwnerSig(body, ownerSig);
    const post = await apiPostJson("/api/kt/register", { leaf: toBase64(encodeLeaf(leaf)), ownerSig: toBase64(ownerSig) });
    if (!post.ok) {
      const err = await post.json().catch(() => ({}));
      throw new Error(`KT register failed: ${err.error ?? `HTTP ${post.status}`}`);
    }
    this.myKeyVersion = 1;
  }

  /**
   * Owner self-monitoring (plan 3.2): every leaf since the last check, paged,
   * authenticated against the signed root, then scanned for keys under my
   * name that are not mine.
   */
  async monitorSelf(): Promise<void> {
    if (!this.enabled) return;
    const sth = await this.refreshHead();
    if (!sth) return;
    let mon = this.st.monitored;
    if (mon && mon.size > sth.treeSize) mon = null;
    const startSize = mon?.size ?? 0;
    if (startSize === sth.treeSize) return;

    let start: CompactRange | null = startSize === 0 ? CompactRange.empty() : null;
    const entries: LeafEntry[] = [];
    let from = startSize;
    for (let page = 0; from < sth.treeSize; page++) {
      if (page >= MAX_LEAF_PAGES) throw new Error("too many leaf pages");
      const r = parseLeavesResponse(await getJson(`/kt/leaves?from=${from}&to=${sth.treeSize}`));
      if (r.from !== from || r.to <= from || r.to > sth.treeSize) {
        this.raiseAlert(`log served leaves ${r.from}..${r.to} for a request from ${from}`);
        return;
      }
      if (!start) {
        try {
          start = await CompactRange.fromHashes(startSize, r.compactRange, fromBase64(mon!.root));
        } catch {
          this.raiseAlert(`compact range at size ${startSize} does not match the root seen earlier`);
          return;
        }
      }
      entries.push(...r.leaves);
      from = r.to;
    }
    const range = await verifyLeafRange(start!, entries, sth);
    if (!range.ok) {
      this.raiseAlert(`leaf batch rejected: ${range.reason}`);
      return;
    }
    const known: KnownKey[] = [];
    const mldsaPkHash = await sha256(this.keys.dsaPublicKey);
    const mlkemPkHash = await sha256(this.keys.kemPublicKey);
    for (let v = 1; v <= Math.max(1, this.myKeyVersion); v++) known.push({ keyVersion: v, mldsaPkHash, mlkemPkHash });
    const alerts = selfMonitor(await hashUsername(this.username), known, range.leaves);
    if (alerts.length > 0) {
      this.raiseAlert(`self-monitoring: ${alerts.map((a) => a.message).join("; ")}`);
      return;
    }
    const myHash = await hashUsername(this.username);
    if (range.leaves.some(({ leaf }) => bytesEqual(leaf.userHash, myHash) && bytesEqual(leaf.mldsaPkHash, mldsaPkHash))) {
      this.st.selfLogged = true;
      this.selfState = "logged";
    }
    this.st.monitored = { size: sth.treeSize, root: toBase64(sth.rootHash) };
    this.save();
    setGlobal({ mode: "ok", treeSize: sth.treeSize, witness: this.witnessResult, self: this.selfState });
  }

  /**
   * Lookup before trusting a peer's identity key (plan 3.1). Returns the
   * peer's KT state; "alert" and "error" mean the key must not be trusted.
   */
  async verifyPeer(peer: string, dsaPub: Uint8Array): Promise<KtPeerState> {
    if (!this.enabled) return { state: "disabled" };
    const at = Date.now();
    const done = (s: KtPeerState) => {
      peerStates.set(peer, s);
      emit();
      return s;
    };
    const pinned = this.st.peers[peer]?.keyVersion;
    let raw: unknown;
    try {
      raw = await getJson(`/kt/proof?user=${encodeURIComponent(peer)}`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        if (pinned !== undefined) {
          const reason = `${peer} was in the log (key version ${pinned}) but the log now denies it`;
          this.raiseAlert(reason);
          return done({ state: "alert", reason, at });
        }
        return done({ state: "not-in-log", at });
      }
      return done({ state: "error", reason: `key transparency log unreachable: ${(err as Error).message}`, at });
    }
    let parsed;
    try {
      parsed = parseLookupResponse(raw);
    } catch (err) {
      const reason = `malformed lookup response for ${peer}: ${(err as Error).message}`;
      this.raiseAlert(reason);
      return done({ state: "alert", reason, at });
    }
    const r = await verifyLookup({
      username: peer,
      response: parsed,
      verifySth,
      mldsaPk: dsaPub,
      minKeyVersion: pinned,
      verifySig: verifyOwner,
    });
    if (!r.ok) {
      const reason = `${peer}'s key failed the transparency check: ${r.reason}`;
      this.raiseAlert(reason);
      return done({ state: "alert", reason, at });
    }
    let linked: boolean;
    try {
      linked = await this.acceptSth(r.sth);
    } catch (err) {
      return done({ state: "error", reason: `consistency check failed: ${(err as Error).message}`, at });
    }
    if (!linked) return done({ state: "alert", reason: globalState.mode === "alert" ? globalState.reason : "inconsistent log", at });
    this.st.peers[peer] = { keyVersion: r.leaf.keyVersion };
    this.save();
    return done({ state: "verified", keyVersion: r.leaf.keyVersion, treeSize: r.sth.treeSize, at });
  }

  /** Compares a peer's gossiped head with mine (plan 3.3). */
  async checkGossip(peer: string, g: unknown): Promise<void> {
    if (!this.enabled || !this.lastSth || !g || typeof g !== "object") return;
    const { treeSize, rootHash } = g as { treeSize?: unknown; rootHash?: unknown };
    if (typeof treeSize !== "number" || !Number.isSafeInteger(treeSize) || treeSize < 0 || typeof rootHash !== "string") return;
    const key = `${treeSize}:${rootHash}`;
    if (this.gossipChecked.has(key)) return;
    let root: Uint8Array;
    try {
      root = fromBase64(rootHash);
    } catch {
      return;
    }
    if (root.length !== 32) return;
    try {
      const link = await this.linkHeads({ treeSize, rootHash: root, timestampMs: 0 }, this.lastSth);
      if (!link.ok) {
        this.raiseAlert(`${peer} sees a different log (${link.kind}): ${link.reason}`);
        return;
      }
      this.gossipChecked.add(key);
    } catch (err) {
      // A proof the server will not serve is inconclusive, not proof of a fork.
      console.warn(`[KT] could not check gossip from ${peer}:`, err);
    }
  }
}
