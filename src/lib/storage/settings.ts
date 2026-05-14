/**
 * settings.ts — Tasks 5.1 + 5.2
 *
 * Typed read/write helpers for:
 *   - BYOK keys and consent flag in `chrome.storage.local` (device-only)
 *   - Custom category list in `chrome.storage.sync` (synced across devices)
 *
 * SECURITY:
 *   - API keys stored only in `chrome.storage.local` (device-scoped, not synced).
 *   - Key values are never passed as function arguments outside this module.
 *   - All storage keys are constants defined here to prevent typos.
 */
import { z } from "zod";
import type { BYOKEngine } from "../classify/byok";
import { CONSENT_KEY } from "../classify/byok";
import { ALL_CATEGORIES } from "../classify/categories";

// ── Storage key constants ────────────────────────────────────────────────

export const BYOK_KEY: Record<BYOKEngine, string> = {
    openai: "byok_openai",
    anthropic: "byok_anthropic",
    gemini: "byok_gemini",
    ollama: "byok_ollama_model",
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

// ── Custom categories (chrome.storage.sync) ───────────────────────────────

const CUSTOM_CATEGORIES_KEY = "custom_categories";

/** Zod schema: an array of non-empty, max-32-char, alphanumeric+spaces strings. */
const CategoryNameSchema = z
    .string()
    .min(1, "Category name cannot be empty")
    .max(32, "Category name must be ≤ 32 characters")
    .regex(/^[a-zA-Z0-9 ]+$/, "Category name may only contain letters, numbers, and spaces");

const CustomCategoriesSchema = z.array(CategoryNameSchema);

export type { z };

/**
 * Read the custom category list from `chrome.storage.sync`.
 * Returns the 8 defaults if no custom list is stored.
 */
export async function getCustomCategories(): Promise<string[]> {
    const raw = await chrome.storage.sync.get(CUSTOM_CATEGORIES_KEY);
    const val = (raw as Record<string, unknown>)[CUSTOM_CATEGORIES_KEY];
    const parsed = CustomCategoriesSchema.safeParse(val);
    if (!parsed.success || parsed.data.length === 0) {
        return [...ALL_CATEGORIES];
    }
    return parsed.data;
}

/**
 * Save the custom category list to `chrome.storage.sync`.
 * Validates with Zod before writing. Returns an error string on failure.
 */
export async function saveCustomCategories(
    categories: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
    const parsed = CustomCategoriesSchema.safeParse(categories);
    if (!parsed.success) {
        const first = parsed.error.issues[0];
        return { ok: false, error: first?.message ?? "Invalid categories" };
    }
    if (parsed.data.length === 0) {
        return { ok: false, error: "Category list cannot be empty" };
    }
    await chrome.storage.sync.set({ [CUSTOM_CATEGORIES_KEY]: parsed.data });
    return { ok: true };
}

/** Reset categories to the 8 defaults in `chrome.storage.sync`. */
export async function restoreDefaultCategories(): Promise<void> {
    await chrome.storage.sync.set({ [CUSTOM_CATEGORIES_KEY]: [...ALL_CATEGORIES] });
}

export { CategoryNameSchema, CUSTOM_CATEGORIES_KEY };

// ── Preferred classification engine (chrome.storage.local) ───────────────

const PREFERRED_ENGINE_KEY = "preferred_engine";

/** Persist the user's chosen classification engine. */
export async function savePreferredEngine(engine: BYOKEngine): Promise<void> {
    await chrome.storage.local.set({ [PREFERRED_ENGINE_KEY]: engine });
}

/**
 * Read the user's previously saved engine choice.
 * Returns `undefined` when no explicit choice has been stored yet —
 * callers should fall back to `getBestAvailableEngine()` in that case.
 */
export async function loadPreferredEngine(): Promise<BYOKEngine | undefined> {
    const raw = await chrome.storage.local.get(PREFERRED_ENGINE_KEY);
    const val: unknown = (raw as Record<string, unknown>)[PREFERRED_ENGINE_KEY];
    const valid: BYOKEngine[] = ["openai", "anthropic", "gemini", "ollama"];
    return typeof val === "string" && (valid as string[]).includes(val)
        ? (val as BYOKEngine)
        : undefined;
}
