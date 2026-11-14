import React, { useRef, useEffect, useState } from "react";
import type { FileCardInfo, StoredMessage } from "../services/messaging";
import type { Protocol } from "../services/protocol";
import FileTransferCard from "./FileTransferCard";
import WireFrameInspector from "./WireFrameInspector";
import CryptoInspectorModal from "./CryptoInspectorModal";

function parseFileCardInfo(raw: string): FileCardInfo | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as FileCardInfo).transferId === "string" &&
      typeof (parsed as FileCardInfo).name === "string" &&
      typeof (parsed as FileCardInfo).size === "number"
    ) {
      return parsed as FileCardInfo;
    }
  } catch {
    return null;
  }
  return null;
}

interface ChatWindowProps {
  user: string;
  activeChat: string | null;
  messages: StoredMessage[];
  onOpenSecurity: () => void;
  input: string;
  setInput: (val: string) => void;
  onSendMessage: () => void;
  onSendImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendAudio: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSendFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setPreviewImage: (url: string | null) => void;
  isSending: boolean;
  onlineUsers: string[];
  protocol?: Protocol | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  user,
  activeChat,
  messages,
  onOpenSecurity,
  input,
  setInput,
  onSendMessage,
  onSendImage,
  onSendAudio,
  onSendFile,
  setPreviewImage,
  isSending,
  onlineUsers,
  protocol,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [devMode, setDevMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("krypt_dev_mode") === "true";
    } catch {
      return false;
    }
  });
  const [showInspectorModal, setShowInspectorModal] = useState(false);

  const toggleDevMode = () => {
    setDevMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("krypt_dev_mode", String(next));
      } catch {
        // ignore localStorage access errors
      }
      return next;
    });
  };
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    if (showAttachMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showAttachMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isTargetOnline = activeChat ? onlineUsers.includes(activeChat) : false;
  const isInputDisabled = isSending;

  return (
    <div
      className={`flex-1 flex flex-col bg-slate-950 ${isSending ? "cursor-wait" : ""}`}
    >
      {activeChat ? (
        <>
          <div className="h-20 px-6 border-b border-slate-800 bg-slate-900 flex items-center justify-between shadow-sm z-0">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-indigo-900/30 text-indigo-400 border border-indigo-800/50 rounded-full flex items-center justify-center font-bold text-lg shadow-inner">
                {activeChat.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100">
                  {activeChat}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isTargetOnline ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-slate-500"
                    }`}
                  />
                  <p className="text-xs text-slate-400 font-medium">
                    {isTargetOnline ? "Online" : "Offline"} • Krypt v1 PQ ratchet
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleDevMode}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 ${
                  devMode
                    ? "bg-indigo-950/80 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
                title="Toggle Cryptographic Dev Mode (lowers abstraction to inspect FIPS 203 / 204 wire frames and ratchet states)"
              >
                <span>🔬</span>
                <span>{devMode ? "Dev Mode: ON" : "Dev Mode"}</span>
              </button>
              {devMode && (
                <button
                  type="button"
                  onClick={() => setShowInspectorModal(true)}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white border border-indigo-400/40 shadow-sm flex items-center gap-1.5 transition"
                  title="Open live post-quantum cryptographic inspector & diagnostic panel"
                >
                  <span>⚡</span>
                  <span>Diagnostics</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSecurity}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-indigo-300 hover:bg-slate-700 transition"
                title="Safety number, key transparency and session status"
              >
                Security
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {devMode && (
              <div className="mb-4 p-3 bg-slate-900/90 border border-indigo-500/40 rounded-xl flex items-center justify-between text-xs text-indigo-200 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-indigo-400">🔬</span>
                  <div>
                    <span className="font-bold text-white">Cryptographic Dev Mode Active</span>
                    <span className="text-slate-400 block text-[11px] mt-0.5">
                      Inspecting live NIST FIPS 203 (ML-KEM-1024), FIPS 204 (ML-DSA-87), blind relay views &amp; <em>K=4</em> ratchet steps.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInspectorModal(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-sm"
                >
                  Open Diagnostics →
                </button>
              </div>
            )}
            {messages.filter(
              (m) => m.to === activeChat || m.from === activeChat,
            ).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
                <div className="p-4 bg-slate-800/50 rounded-full">
                  <svg
                    className="w-8 h-8 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    ></path>
                  </svg>
                </div>
                <p>Send a message to initiate the Hybrid Key Exchange.</p>
              </div>
            ) : (
              messages
                .filter((m) => m.to === activeChat || m.from === activeChat)
                .map((msg, i) => {
                  // Only notices this device wrote; a peer's text never shows as one, whatever it says.
                  if (msg.notice) {
                    return (
                      <div key={msg.id ?? i} className="w-full my-4 flex justify-center">
                        <div className="px-4 py-2 rounded-xl text-xs max-w-[85%] text-center shadow-sm flex items-center gap-2 border bg-amber-950/40 border-amber-600/40 text-amber-200">
                          <span className="text-amber-400">⚡</span>
                          <span className="font-medium leading-relaxed">{msg.decryptedText}</span>
                        </div>
                      </div>
                    );
                  }

                  const isMe = msg.from === user;
                  return (
                    <div
                      key={msg.id ?? i}
                      data-testid="message"
                      data-from={msg.from}
                      data-type={msg.type}
                      className={`mb-6 flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`px-3 py-2 rounded-2xl max-w-[75%] shadow-sm min-w-0 ${
                          isMe
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none"
                        }`}
                      >
                        {msg.type === "image" ? (
                          <img
                            src={msg.decryptedText}
                            alt="Secure shared"
                            onClick={() => setPreviewImage(msg.decryptedText)}
                            className="max-w-full max-h-62.5 rounded-xl object-contain block mx-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                            loading="lazy"
                          />
                        ) : msg.type === "file" ? (
                          (() => {
                            const info = parseFileCardInfo(msg.decryptedText);
                            return info ? (
                              <FileTransferCard info={info} />
                            ) : (
                              <p className="text-xs text-red-400 italic px-2 py-1">
                                Malformed file transfer card
                              </p>
                            );
                          })()
                        ) : msg.type === "audio" ? (
                          <audio
                            controls
                            src={msg.decryptedText}
                            className="max-w-full h-10 outline-none"
                          />
                        ) : (
                          <p className="text-sm px-1 py-1 break-all whitespace-pre-wrap min-w-0">
                            {msg.decryptedText}
                          </p>
                        )}
                      </div>
                      {devMode && <WireFrameInspector msg={msg} isMe={isMe} />}
                      <div
                        className={`mt-1 flex items-center gap-2 text-[10px] text-slate-500 max-w-[75%] ${isMe ? "flex-row-reverse" : "flex-row"}`}
                      >
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800">
            <div className="flex gap-3 items-center max-w-4xl mx-auto">
              {/* Preserved file inputs (with exact IDs for testing and accessibility) */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                id="image-upload"
                className="hidden"
                onChange={(e) => {
                  setShowAttachMenu(false);
                  onSendImage(e);
                }}
                disabled={isInputDisabled}
              />
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                id="audio-upload"
                className="hidden"
                onChange={(e) => {
                  setShowAttachMenu(false);
                  onSendAudio(e);
                }}
                disabled={isInputDisabled}
              />
              <input
                ref={fileInputRef}
                type="file"
                id="file-upload"
                className="hidden"
                onChange={(e) => {
                  setShowAttachMenu(false);
                  onSendFile(e);
                }}
                disabled={isInputDisabled}
              />

              {/* Merged Attachment Button & Dropdown Menu */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  type="button"
                  id="attachment-menu-button"
                  onClick={() => setShowAttachMenu((v: boolean) => !v)}
                  disabled={isInputDisabled}
                  className={`p-3 bg-slate-800 text-slate-300 rounded-xl transition-all border border-slate-700 shadow-sm flex items-center justify-center ${
                    isInputDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-slate-700 hover:text-white cursor-pointer"
                  } ${showAttachMenu ? "bg-slate-700 text-indigo-400 border-indigo-500/60 ring-2 ring-indigo-500/20" : ""}`}
                  title={isInputDisabled ? "Target offline or calculating handshake" : "Attach Photo, Audio, or File"}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                    />
                  </svg>
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-16 left-0 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 min-w-[210px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left group"
                    >
                      <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg group-hover:bg-indigo-500/30 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">Send Image</div>
                        <div className="text-[11px] text-slate-400">Encrypted inline photo</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left group"
                    >
                      <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                          />
                        </svg>
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">Send Audio</div>
                        <div className="text-[11px] text-slate-400">Encrypted audio clip</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left group"
                    >
                      <span className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg group-hover:bg-cyan-500/30 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </span>
                      <div>
                        <div className="font-semibold text-slate-100">Send Document</div>
                        <div className="text-[11px] text-slate-400">Encrypted file transfer</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <input
                placeholder={
                  isSending
                    ? "Calculating cryptographic handshake..."
                    : isTargetOnline
                      ? `Secure message to ${activeChat}...`
                      : `Secure message to ${activeChat} (offline)...`
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !isInputDisabled && onSendMessage()
                }
                disabled={isInputDisabled}
                className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 focus:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/50 rounded-xl transition-all outline-none text-slate-100 placeholder-slate-500 disabled:opacity-50 shadow-inner"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onSendMessage();
                }}
                disabled={isInputDisabled || !input.trim()}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-6 h-6 transform rotate-45 -mt-1 ml-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-500">
          <svg
            className="w-20 h-20 mb-4 text-slate-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            ></path>
          </svg>
          <h2 className="text-xl font-medium text-slate-400 mb-2">
            No connection selected
          </h2>
          <p className="text-sm">
            Search for a user in the sidebar to open a secure channel.
          </p>
        </div>
      )}
      {showInspectorModal && (
        <CryptoInspectorModal
          peer={activeChat}
          protocol={protocol ?? null}
          onClose={() => setShowInspectorModal(false)}
        />
      )}
    </div>
  );
};

export default ChatWindow;