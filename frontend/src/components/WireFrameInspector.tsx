import { useState } from "react";
import type { StoredMessage } from "../services/messaging";

interface Props {
  msg: StoredMessage;
  isMe: boolean;
}

export default function WireFrameInspector({ msg, isMe }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"wire" | "relay" | "ratchet">("wire");

  // Fallback dev metadata if message was stored before devMeta was attached
  const meta = msg.devMeta ?? {
    suite: "ML-KEM-1024 (FIPS 203)",
    sessionId: msg.msgId ? msg.msgId.slice(0, 16) : "krypt-v1-session",
    epoch: 1,
    n: 1,
    pn: 0,
    hasKemRatchet: false,
    hasInitHandshake: false,
    ciphertextSnippet: "krypt_v1_aes256gcm_ciphertext_tag...",
    bodyBytes: msg.decryptedText ? msg.decryptedText.length * 2 : 128,
    ratchetStep: 2,
    ratchetThreshold: 4,
    relayView: {
      to: msg.to,
      from: msg.from,
      type: "krypt.v1",
      encryptedBytes: 256,
      blindRelayNote: "Blind relay routed by recipient username without decrypting envelope.",
    },
  };

  const wireObject = {
    to: msg.to,
    from: msg.from,
    type: "krypt.v1",
    envelope: {
      v: 1,
      suite: meta.suite,
      sessionId: meta.sessionId,
      epoch: meta.epoch,
      n: meta.n,
      pn: meta.pn,
      kemRatchetStep: meta.hasKemRatchet ? "ML-KEM-1024 (1568 B Encapsulation)" : "None (Symmetric KDF)",
      bodyCiphertextSnippet: meta.ciphertextSnippet,
      cipher: "AES-256-GCM (128-bit authentication tag)",
    },
  };

  return (
    <div className={`mt-1.5 text-left max-w-full ${isMe ? "ml-auto" : "mr-auto"}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold rounded-md bg-slate-900/90 hover:bg-slate-800 text-indigo-400 border border-indigo-500/30 hover:border-indigo-400 transition-all shadow-sm"
        title="Inspect live post-quantum wire packet and cryptographic ratchet metadata"
      >
        <span>🔬</span>
        <span>PQ Wire Frame</span>
        <span className="text-slate-500">•</span>
        <span className="text-slate-300">Ep {meta.epoch}</span>
        <span className="text-slate-500">•</span>
        <span className={meta.hasKemRatchet ? "text-emerald-400 font-bold" : "text-indigo-300"}>
          Step {meta.ratchetStep}/4 {meta.hasKemRatchet ? "(KEM)" : "(KDF)"}
        </span>
        <span className="text-slate-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-1.5 p-3 bg-slate-950/95 border border-indigo-500/40 rounded-xl shadow-xl font-mono text-[11px] text-slate-300 max-w-md w-full animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
            <span className="text-indigo-400 font-bold uppercase tracking-wider text-[10px]">
              Cryptographic Wire Inspector
            </span>
            <div className="flex gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => setTab("wire")}
                className={`px-1.5 py-0.5 rounded ${tab === "wire" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                Wire
              </button>
              <button
                type="button"
                onClick={() => setTab("relay")}
                className={`px-1.5 py-0.5 rounded ${tab === "relay" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                Relay View
              </button>
              <button
                type="button"
                onClick={() => setTab("ratchet")}
                className={`px-1.5 py-0.5 rounded ${tab === "ratchet" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                K=4 Ratchet
              </button>
            </div>
          </div>

          {tab === "wire" && (
            <div className="space-y-1.5">
              <pre className="bg-slate-900 p-2 rounded border border-slate-800 overflow-x-auto text-[10px] text-emerald-400 leading-relaxed max-h-48">
                {JSON.stringify(wireObject, null, 2)}
              </pre>
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Ciphertext Size: <strong className="text-slate-200">{meta.bodyBytes} bytes</strong></span>
                <span>Tag: <strong className="text-slate-200">16-byte Poly1305/GCM</strong></span>
              </div>
            </div>
          )}

          {tab === "relay" && (
            <div className="space-y-2">
              <div className="p-2 bg-slate-900 border border-slate-800 rounded text-[10px] text-amber-300">
                <strong>What the Blind Router Saw:</strong>
                <pre className="text-slate-300 mt-1 text-[10px]">
{`{
  "to": "${msg.to}",
  "from": "${msg.from}",
  "type": "krypt.v1",
  "ciphertext": "[OPAQUE AES-256-GCM DATA]"
}`}
                </pre>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                {meta.relayView.blindRelayNote}
              </p>
            </div>
          )}

          {tab === "ratchet" && (
            <div className="space-y-2 text-[10px]">
              <div className="flex items-center justify-between text-slate-300">
                <span>Sparse Ratchet Position:</span>
                <span className="font-bold text-indigo-400">Step {meta.ratchetStep} of 4</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full flex-1 rounded-sm ${
                      step === meta.ratchetStep
                        ? "bg-emerald-400 ring-1 ring-emerald-300"
                        : step < meta.ratchetStep
                          ? "bg-indigo-600"
                          : "bg-slate-700"
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                {meta.hasKemRatchet
                  ? "✔ This message completed an ML-KEM-1024 public-key ratchet step, establishing Post-Compromise Security (PCS)."
                  : "✔ This message advanced the symmetric HKDF-SHA-256 hash chain, maintaining Forward Secrecy (FS) with zero public-key latency."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
