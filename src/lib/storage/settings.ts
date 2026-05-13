/**
 * settings.ts — Task 5.1
 *
 * Typed read/write helpers for BYOK keys and consent flag in
 * `chrome.storage.local`. Keys are NEVER written to `chrome.storage.sync`.
 *
 * SECURITY:
 *   - API keys stored only in `chrome.storage.local` (device-scoped, not synced).
 *   - Key values are never passed as function arguments outside this module —
 *     callers only receive presence/absence booleans where possible.
 *   - All storage keys are constants defined here to prevent typos.
 */
import type { BYOKEngine } from "../classify/byok";
import { CONSENT_KEY } from "../classify/byok";

// ── Storage key constants ────────────────────────────────────────────────

export const BYOK_KEY: Record<BYOKEngine, string> = {
  openai: "byok_openai",
  anthropic: "byok_anthropic",
  gemini: "byok_gemini",
} as const;

// ── Writes ────────────────────────────────────────────────────────────────

/** Save a BYOK API key to chrome.storage.local. */
export async function saveBYOKKey(
  engine: BYOKEngine,
  apiKey: string,
): Promise<void> {
  await chrome.storage.local.set({ [BYOK_KEY[engine]]: apiKey });
}

/** Remove a BYOK API key from chrome.storage.local. */
export async function removeBYOKKey(engine: BYOKEngine): Promise<void> {
  await chrome.storage.local.remove(BYOK_KEY[engine]);
}

/** Save the user's BYOK consent flag (first-use consent to send data). */
export async function setConsent(granted: boolean): Promise<void> {
  await chrome.storage.local.set({ [CONSENT_KEY]: granted });
}

// ── Reads ─────────────────────────────────────────────────────────────────

/**
 * Check whether a BYOK key is configured (non-empty) for an engine.
 * Returns `true`/`false` without exposing the key value.
 */
export async function hasBYOKKey(engine: BYOKEngine): Promise<boolean> {
  const raw = await chrome.storage.local.get(BYOK_KEY[engine]);
  const val = (raw as Record<string, unknown>)[BYOK_KEY[engine]];
  return typeof val === "string" && val !== "";
}

/** Read the consent flag. Returns `false` if not yet set. */
export async function getConsent(): Promise<boolean> {
  const raw = await chrome.storage.local.get(CONSENT_KEY);
  const val = (raw as Record<string, unknown>)[CONSENT_KEY];
  return val === true;
}
