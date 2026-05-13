/**
 * Task 7.1: Native Messaging bridge (extension side)
 *
 * Manages a lazy connection to the companion daemon via chrome.runtime.connectNative.
 * - Connects only on the first outbound MCP request (not on startup).
 * - Reconnects on disconnect using exponential backoff (capped at 30 s).
 * - Validates all incoming daemon messages with Zod before processing.
 * - Exposes `isDaemonInstalled()` / `setDaemonListener()` for UI banners.
 *
 * SECURITY:
 * - Host name is a constant — not configurable at runtime.
 * - Incoming messages are Zod-validated; unknown shapes are dropped silently.
 * - The host manifest restricts which extensions may connect; Chrome enforces
 *   the `allowed_origins` list, so spoofing is not possible from within the
 *   browser.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Protocol types
// ---------------------------------------------------------------------------

/** Messages sent FROM the extension TO the daemon. */
export interface OutboundMessage {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}

/** Zod schema for messages arriving FROM the daemon. */
const InboundMessageSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

/** Callback type for consumers that handle inbound messages. */
export type MessageHandler = (msg: InboundMessage) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATIVE_HOST = "com.deepmarks.daemon";

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let port: chrome.runtime.Port | null = null;
let attemptCount = 0;
let reconnectTimerId: ReturnType<typeof setTimeout> | null = null;
let daemonInstalled = true; // optimistic until first hard error

const handlers = new Set<MessageHandler>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function backoffDelay(attempt: number): number {
  const delay = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attempt);
  return Math.min(delay, BACKOFF_MAX_MS);
}

function onMessage(raw: unknown): void {
  const result = InboundMessageSchema.safeParse(raw);
  if (!result.success) {
    // Drop malformed messages silently.
    return;
  }
  const msg = result.data;
  for (const handler of handlers) {
    handler(msg);
  }
}

function onDisconnect(): void {
  port = null;

  // chrome.runtime.lastError is set when the native host is not installed.
  const err = chrome.runtime.lastError;
  if (err !== undefined) {
    const msg: string = err.message ?? "";
    if (
      msg.includes("not found") ||
      msg.includes("not registered") ||
      msg.includes("Specified native messaging host not found")
    ) {
      daemonInstalled = false;
      // Do not retry: daemon is not installed.
      return;
    }
  }

  // Transient disconnect — schedule reconnect with backoff.
  attemptCount += 1;
  const delay = backoffDelay(attemptCount);
  reconnectTimerId = setTimeout(() => {
    reconnectTimerId = null;
    connect();
  }, delay);
}

function connect(): void {
  if (port !== null) return; // already connected

  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
    daemonInstalled = true;
    attemptCount = 0;

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  } catch {
    // connectNative throws synchronously if the host is not registered (Firefox).
    daemonInstalled = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the daemon native host is installed and reachable.
 * Returns `false` after the first connection attempt where Chrome reports the
 * host is not found.
 */
export function isDaemonInstalled(): boolean {
  return daemonInstalled;
}

/**
 * Register a handler for validated inbound messages from the daemon.
 * Returns an unsubscribe function.
 */
export function setDaemonListener(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

/**
 * Send a message to the daemon. Triggers a lazy connect on first call.
 * Returns `false` if no connection is available.
 */
export function sendToDaemon(msg: OutboundMessage): boolean {
  if (port === null) {
    connect();
  }
  if (port === null) {
    return false;
  }
  port.postMessage(msg);
  return true;
}

/**
 * Force-disconnect and cancel any pending reconnect. Called in tests or on
 * extension suspend.
 */
export function disconnectDaemon(): void {
  if (reconnectTimerId !== null) {
    clearTimeout(reconnectTimerId);
    reconnectTimerId = null;
  }
  if (port !== null) {
    port.disconnect();
    port = null;
  }
  attemptCount = 0;
}
