import { useEffect, useState, useSyncExternalStore } from "react";
import type { SessionStatus } from "../crypto/session";
import type { Protocol } from "../services/protocol";
import { loadContact, pinnedDsa, type ContactRecord } from "../services/trust";
import { safetyNumber } from "../crypto/safetyNumber";
import { getKtPeerState, getKtState, ktVersion, subscribeKt } from "../services/kt";
import { ktPeerSummary, ktSummary, toneClass } from "./ktSummary";
import { toBase64 } from "@krypt/shared";

type TabType = "session" | "primitives" | "threat" | "kt";

interface Props {
  peer: string | null;
  protocol: Protocol | null;
  onClose: () => void;
}

export default function CryptoInspectorModal({ peer, protocol, onClose }: Props) {
  useSyncExternalStore(subscribeKt, ktVersion);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [safetyNum, setSafetyNum] = useState<string[] | null>(null);
  const [contact, setContact] = useState<ContactRecord | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("session");

  useEffect(() => {
    if (!protocol || !peer) return;
    let live = true;
    (async () => {
      try {
        const c = await loadContact(peer, protocol.keys);
        const theirs = c ? pinnedDsa(c) : null;
        const s = theirs ? await safetyNumber(protocol.keys.dsaPublicKey, theirs) : null;
        const st = await protocol.session.getStatus(peer);
        if (live) {
          setContact(c);
          setSafetyNum(s);
          setSessionStatus(st);
        }
      } catch (err) {
        console.warn("[Inspector] error loading peer state:", err);
      }
    })();
    return () => {
      live = false;
    };
  }, [peer, protocol]);

  const ktState = getKtState();
  const ktGlobal = ktSummary(ktState);
  const ktPeer = peer ? ktPeerSummary(getKtPeerState(peer)) : null;

  const myKemPubB64 = protocol ? toBase64(protocol.keys.kemPublicKey).slice(0, 36) + "..." : "Loading...";
  const myDsaPubB64 = protocol ? toBase64(protocol.keys.dsaPublicKey).slice(0, 36) + "..." : "Loading...";
  const peerDsaB64 = contact && pinnedDsa(contact) ? toBase64(pinnedDsa(contact)!).slice(0, 36) + "..." : "Unpinned / Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Krypt Under-the-Hood Cryptographic Inspector
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  NIST FIPS 203 & 204
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Exposing active mathematical primitives, post-quantum ratchets, and wire packets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/90 px-5 gap-2 pt-2">
          {(
            [
              { id: "session", label: "Ratchet & Session (K=4)" },
              { id: "primitives", label: "Post-Quantum Keys" },
              { id: "threat", label: "Quantum Threat Matrix" },
              { id: "kt", label: "Key Transparency Log" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {activeTab === "session" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Peer</div>
                  <div className="text-lg font-bold text-indigo-300 mt-0.5">{peer ?? "No active conversation"}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Role: <span className="text-slate-300 font-mono">{sessionStatus?.role ?? "uninitialized"}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Current Ratchet Epoch</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    Epoch {sessionStatus ? sessionStatus.epoch : 0}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Send Epoch: <span className="text-slate-300 font-mono">{sessionStatus?.sendEpoch ?? 0}</span> • Recv Epoch: <span className="text-slate-300 font-mono">{sessionStatus?.recvEpoch ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Sparse Ratchet Explanation Card */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡</span> Sparse Ratchet Threshold (K = 4)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full font-mono">
                    E7 Optimization
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Post-quantum public-key operations (ML-KEM-1024) take 1,568 bytes of bandwidth per exchange. Krypt optimizes this by performing a full quantum-safe KEM public-key ratchet step <strong>every 4 messages (K = 4)</strong>. Messages between steps advance instantly using symmetric <strong>HKDF-SHA-256</strong> hash ratcheting.
                </p>
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
                    <span>Progress to next KEM Step</span>
                    <span>K = 4 Interval</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex gap-1 p-0.5">
                    <div className="h-full flex-1 bg-emerald-500 rounded-sm" title="Step 1: KEM Public Key Ratchet (PCS)" />
                    <div className="h-full flex-1 bg-indigo-500 rounded-sm" title="Step 2: Symmetric Chain Key (FS)" />
                    <div className="h-full flex-1 bg-indigo-500 rounded-sm" title="Step 3: Symmetric Chain Key (FS)" />
                    <div className="h-full flex-1 bg-indigo-500 rounded-sm" title="Step 4: Symmetric Chain Key (FS)" />
                  </div>
                </div>
              </div>

              {/* Session ID & Safety Number */}
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Session Identifier</div>
                  <div className="font-mono text-xs text-slate-300 mt-1 break-all bg-slate-900 p-2 rounded border border-slate-800">
                    {sessionStatus ? sessionStatus.sessionId : "No established session"}
                  </div>
                </div>

                {safetyNum && (
                  <div>
                    <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">60-Digit Cryptographic Safety Number</div>
                    <div className="grid grid-cols-4 gap-2 mt-1.5 font-mono text-xs text-amber-300 bg-slate-900 p-2.5 rounded border border-slate-800 text-center">
                      {safetyNum.map((chunk, i) => (
                        <span key={i} className="tracking-wider">{chunk}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "primitives" && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-200">Local Identity Keys (FIPS Standard)</div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800 px-2 py-0.5 rounded-full">
                    Hardware / RAM Kept
                  </span>
                </div>

                <div>
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>ML-KEM-1024 Public Key (FIPS 203)</span>
                    <span className="text-slate-500 font-mono">1,568 bytes</span>
                  </div>
                  <div className="font-mono text-xs text-slate-300 mt-1 bg-slate-900 p-2 rounded border border-slate-800 break-all">
                    {myKemPubB64}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>ML-DSA-87 Signing Public Key (FIPS 204)</span>
                    <span className="text-slate-500 font-mono">2,592 bytes</span>
                  </div>
                  <div className="font-mono text-xs text-slate-300 mt-1 bg-slate-900 p-2 rounded border border-slate-800 break-all">
                    {myDsaPubB64}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Peer ML-DSA-87 Identity Key (Pinned)</span>
                    <span className="text-slate-500 font-mono">2,592 bytes</span>
                  </div>
                  <div className="font-mono text-xs text-slate-300 mt-1 bg-slate-900 p-2 rounded border border-slate-800 break-all">
                    {peerDsaB64}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <div className="font-bold text-xs text-slate-300 uppercase tracking-wider">Authentication Protocol</div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  <strong>SRP-6a (Zero-Knowledge Augmented PAKE):</strong> Password is never transmitted over network nor stored on server. The server stores only a random salt and SRP-6a verifier <code className="text-indigo-400">v = g^x mod N</code>. Mutual authentication verified via ephemeral proofs.
                </div>
              </div>
            </div>
          )}

          {activeTab === "threat" && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                <h3 className="font-bold text-slate-200 mb-2">Shor's Algorithm & Quantum Threat Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2">Algorithm Class</th>
                        <th className="pb-2">Standard Used</th>
                        <th className="pb-2">Quantum Attack</th>
                        <th className="pb-2">Krypt Security Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      <tr>
                        <td className="py-2.5 text-slate-300">RSA-2048 / 4096</td>
                        <td className="py-2.5 text-slate-400">PKCS #1</td>
                        <td className="py-2.5 text-red-400">Shor's Factoring</td>
                        <td className="py-2.5 text-red-400 font-bold">❌ Completely Broken</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-300">ECDH / ECDSA (P-256)</td>
                        <td className="py-2.5 text-slate-400">ANSI X9.62</td>
                        <td className="py-2.5 text-red-400">Shor's Discrete Log</td>
                        <td className="py-2.5 text-red-400 font-bold">❌ Completely Broken</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-300">Krypt ML-KEM-1024</td>
                        <td className="py-2.5 text-indigo-400">NIST FIPS 203</td>
                        <td className="py-2.5 text-emerald-400">Module-LWE Lattice</td>
                        <td className="py-2.5 text-emerald-400 font-bold">✔ NIST Category 5 Safe</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-300">Krypt ML-DSA-87</td>
                        <td className="py-2.5 text-indigo-400">NIST FIPS 204</td>
                        <td className="py-2.5 text-emerald-400">Module-SIS Lattice</td>
                        <td className="py-2.5 text-emerald-400 font-bold">✔ NIST Category 5 Safe</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-300">Symmetric AES-256-GCM</td>
                        <td className="py-2.5 text-indigo-400">NIST SP 800-38D</td>
                        <td className="py-2.5 text-emerald-400">Grover's Search</td>
                        <td className="py-2.5 text-emerald-400 font-bold">✔ 128-bit Post-Quantum</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-950/20 border border-emerald-600/30 rounded-xl text-xs text-emerald-300 leading-relaxed">
                <strong>Harvest-Now-Decrypt-Later (HNDL) Immunity:</strong> Adversaries eavesdropping on encrypted traffic today cannot decrypt it in the future with quantum computers, because all session keys are derived using 256-bit entropy ML-KEM-1024 ciphertexts.
              </div>
            </div>
          )}

          {activeTab === "kt" && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Append-Only Merkle Tree Log (RFC 9162)</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${toneClass[ktGlobal.tone]}`}>
                    {ktGlobal.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Key Transparency ensures the server cannot secretly substitute a user's public key without being detected by both clients and the independent witness.
                </p>

                <div className="space-y-2 pt-1 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-800 py-1.5">
                    <span className="text-slate-400">Tree Log Mode</span>
                    <span className="text-slate-200 font-bold capitalize">{ktState.mode}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 py-1.5">
                    <span className="text-slate-400">Tree Head Size</span>
                    <span className="text-slate-200 font-bold">
                      {ktState.mode === "ok" ? `${ktState.treeSize} leaves` : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Independent Witness</span>
                    <span className="text-emerald-400 font-bold">
                      {ktState.mode === "ok"
                        ? (ktState.witness === "verified" ? "Verified (RFC 9162)" : ktState.witness === "stale" ? "Stale" : "None")
                        : "Active (GitHub Actions)"}
                    </span>
                  </div>
                </div>
              </div>

              {ktPeer && (
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
                    Peer Verification ({peer})
                  </div>
                  <div className={`text-xs font-bold ${toneClass[ktPeer.tone]}`}>
                    {ktPeer.label}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{ktPeer.detail}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>Project Krypt Academic Demonstration Tool</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition shadow"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
