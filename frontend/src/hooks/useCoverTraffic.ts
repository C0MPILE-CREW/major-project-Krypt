import { useEffect, useRef } from "react";
import type { Protocol } from "../services/protocol";
import { sendCoverMessage } from "../services/messaging";
import { socket } from "../services/socket";

export interface CoverTrafficOptions {
  enabled?: boolean;
  minIntervalMs?: number;
  maxIntervalMs?: number;
}

/**
 * Periodically sends dummy cover traffic to an active, online contact.
 *
 * Properties:
 * 1. Strictly online-only: never sends if peer is offline (protects offline mailbox quota).
 * 2. Tab-visibility aware: pauses when tab is minimized/hidden (prevents battery drain).
 * 3. Uniformly padded: each cover message is 512 bytes (+16 B tag), identical to short text.
 * 4. Advances ratchets: provides forward secrecy healing even during conversation pauses.
 */
export function useCoverTraffic(
  protocol: Protocol | null,
  activeChat: string | null,
  onlineUsers: string[],
  options: CoverTrafficOptions = {},
) {
  const { enabled = true, minIntervalMs = 20_000, maxIntervalMs = 45_000 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !protocol || !activeChat || !onlineUsers.includes(activeChat)) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }

    let isCancelled = false;

    const scheduleNext = () => {
      if (isCancelled) return;
      const jitter = minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs);
      timerRef.current = setTimeout(async () => {
        // Confirm preconditions before sending
        if (
          !isCancelled &&
          socket.connected &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          onlineUsers.includes(activeChat)
        ) {
          try {
            await sendCoverMessage(protocol, activeChat);
          } catch (err) {
            // Failure to send cover traffic (e.g. temporary network blip) is non-fatal
            console.debug("[Krypt] cover traffic skipped:", err);
          }
        }
        if (!isCancelled) {
          scheduleNext();
        }
      }, jitter);
    };

    scheduleNext();

    return () => {
      isCancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [protocol, activeChat, onlineUsers, enabled, minIntervalMs, maxIntervalMs]);
}

