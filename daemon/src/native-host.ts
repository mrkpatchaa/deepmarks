/**
 * Native Messaging stdin/stdout framing (Chrome spec).
 *
 * Protocol: each message is prefixed with a 4-byte little-endian uint32 length,
 * followed by that many UTF-8 bytes of JSON.
 *
 * This module handles:
 *   - Reading framed messages from stdin
 *   - Writing framed messages to stdout
 *   - Routing incoming extension messages to registered handlers
 *   - Relaying responses back to the extension
 */

import type { DaemonToExt, ExtToDaemon } from "./types.ts";

type ExtMessageHandler = (msg: ExtToDaemon) => void;

const handlers = new Set<ExtMessageHandler>();

// ---------------------------------------------------------------------------
// Write — send a framed JSON message to stdout
// ---------------------------------------------------------------------------

export function sendToExtension(msg: DaemonToExt): void {
  const json = JSON.stringify(msg);
  const jsonBytes = Buffer.from(json, "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(jsonBytes.length, 0);
  // Write synchronously to stdout — process.stdout is a writable stream.
  process.stdout.write(Buffer.concat([header, jsonBytes]));
}

// ---------------------------------------------------------------------------
// Read — parse framed messages from stdin
// ---------------------------------------------------------------------------

export function startNativeMessagingReader(): void {
  let buf = Buffer.alloc(0);

  process.stdin.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    processBuffer();
  });

  process.stdin.on("end", () => {
    // Extension disconnected — exit cleanly.
    process.exit(0);
  });

  function processBuffer(): void {
    // Loop so we handle multiple messages in a single data event.
    for (;;) {
      if (buf.length < 4) break;
      const msgLen = buf.readUInt32LE(0);
      if (buf.length < 4 + msgLen) break;

      const jsonStr = buf.subarray(4, 4 + msgLen).toString("utf8");
      buf = buf.subarray(4 + msgLen);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr) as unknown;
      } catch {
        // Malformed JSON — skip.
        continue;
      }

      dispatchMessage(parsed);
    }
  }
}

function dispatchMessage(raw: unknown): void {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>)["id"] !== "number" ||
    typeof (raw as Record<string, unknown>)["type"] !== "string"
  ) {
    return;
  }
  const msg = raw as ExtToDaemon;
  for (const handler of handlers) {
    handler(msg);
  }
}

// ---------------------------------------------------------------------------
// Register a handler for messages from the extension
// ---------------------------------------------------------------------------

export function onExtensionMessage(handler: ExtMessageHandler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}
