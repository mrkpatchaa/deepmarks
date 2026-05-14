/**
 * Classify router — Task 4.3
 *
 * `classify(id, url, title, engine?)` is the single entry point for
 * bookmark classification. It:
 *   1. Reads whether a BYOK key is configured for the requested engine.
 *   2. If BYOK is available, delegates to classifyWithBYOK.
 *   3. On BYOK failure (any error), falls back to classifyByRegex.
 *   4. Writes the result back to IndexedDB (meta.category + meta.classifiedAt
 *      + meta.classifiedBy). Never calls chrome.bookmarks.update().
 *
 * The caller receives the category and the engine that was actually used.
 *
 * SECURITY: API key handling, consent checks, and prompt construction are
 * all inside byok.ts — this module never touches keys or raw API responses.
 */
import type { Category, ClassifyEngine, Result } from "../bookmarks/types";
import { ok } from "../bookmarks/types";
import type { BYOKEngine } from "./byok";
import { classifyWithBYOK, CONSENT_KEY, classifyBatchWithBYOK } from "./byok";
import { classifyByRegex } from "./regex";
import { getBookmarkById, upsertBookmark } from "../storage/db";

export interface ClassifyOutput {
    category: Category;
    /** Subject-matter field slug from LLM (e.g. "ai"). Undefined for regex results. */
    domain?: string;
    /** The engine that actually produced the result (may differ from requested). */
    usedEngine: ClassifyEngine;
}

// ── BYOK availability check ───────────────────────────────────────────────

const STORAGE_KEY: Record<BYOKEngine, string> = {
    openai: "byok_openai",
    anthropic: "byok_anthropic",
    gemini: "byok_gemini",
    ollama: "byok_ollama_model",
} as const;

async function isByokAvailable(engine: BYOKEngine): Promise<boolean> {
    try {
        // Ollama runs locally — no consent required.
        if (engine !== "ollama") {
            const consentRaw = await chrome.storage.local.get(CONSENT_KEY);
            const consent = (consentRaw as Record<string, unknown>)[CONSENT_KEY];
            if (consent !== true) return false;
        }

        const keyRaw = await chrome.storage.local.get(STORAGE_KEY[engine]);
        const key = (keyRaw as Record<string, unknown>)[STORAGE_KEY[engine]];
        return typeof key === "string" && key !== "";
    } catch {
        return false;
    }
}

// ── Meta persistence ──────────────────────────────────────────────────────

async function persistMeta(
    id: string,
    category: Category,
    engine: ClassifyEngine,
    domain?: string,
): Promise<void> {
    const bookmarkResult = await getBookmarkById(id);
    if (!bookmarkResult.ok || bookmarkResult.value === undefined) return;

    const updated = {
        ...bookmarkResult.value,
        meta: {
            ...(bookmarkResult.value.meta ?? { tags: [] }),
            category,
            classifiedAt: Date.now(),
            classifiedBy: engine,
            domain,
        },
    };
    await upsertBookmark(updated);
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Classify a bookmark by URL + title.
 *
 * @param id       The bookmark's IndexedDB / chrome ID — used to persist meta.
 * @param url      The bookmark URL.
 * @param title    The bookmark title.
 * @param engine   Preferred BYOK engine; defaults to "openai". If BYOK is
 *                 unavailable or fails, falls back to regex silently.
 */
export async function classify(
    id: string,
    url: string,
    title: string,
    engine: BYOKEngine = "openai",
): Promise<Result<ClassifyOutput>> {
    let category: Category;
    let usedEngine: ClassifyEngine;
    let domain: string | undefined;

    const byokAvailable = await isByokAvailable(engine);

    if (byokAvailable) {
        const byokResult = await classifyWithBYOK(url, title, engine);
        if (byokResult.ok) {
            category = byokResult.value.category;
            domain = byokResult.value.domain;
            usedEngine = engine;
        } else if (engine === "ollama") {
            // Ollama is local — the user explicitly chose it. Surface the error
            // (e.g. 403 / OLLAMA_ORIGINS) so they can act on it, rather than
            // silently reclassifying with regex and hiding the misconfiguration.
            return err(byokResult.error);
        } else {
            // Cloud BYOK failed — fall back to regex silently so the user always
            // gets a usable result even during transient API outages.
            category = classifyByRegex(url, title);
            usedEngine = "regex";
        }
    } else {
        category = classifyByRegex(url, title);
        usedEngine = "regex";
    }

    // Persist the result to IndexedDB. Failure is non-fatal — log and continue.
    await persistMeta(id, category, usedEngine, domain).catch(() => {
        // Intentionally swallowed — classify result is still valid.
    });

    return ok({ category, domain, usedEngine });
}

// ── Batch public API ────────────────────────────────────────────────────

export interface ClassifyBatchOutput {
    /** Successfully classified items — absent items should be counted as failed. */
    results: ReadonlyArray<{ id: string; output: ClassifyOutput }>;
}

/**
 * Classify a batch of bookmarks in a single LLM API call.
 *
 * When BYOK is available:
 *   - Sends all items to the LLM in one request (up to BYOK_BATCH_SIZE items).
 *   - For Ollama failures: returns empty results (surfaces the error as zero
 *     classified rather than silently falling back to regex).
 *   - For cloud BYOK failures: falls back to regex classification per item.
 * When BYOK is unavailable: classifies every item with regex.
 *
 * Always persists results to IndexedDB before returning.
 */
export async function classifyBatch(
    items: Array<{ id: string; url: string; title: string }>,
    engine: BYOKEngine = "openai",
): Promise<ClassifyBatchOutput> {
    const byokAvailable = await isByokAvailable(engine);

    if (byokAvailable) {
        const batchResult = await classifyBatchWithBYOK(items, engine);
        if (batchResult.ok) {
            const results: Array<{ id: string; output: ClassifyOutput }> = [];
            for (const { id, category, domain } of batchResult.value) {
                await persistMeta(id, category, engine, domain).catch(() => {
                    // Non-fatal — result is still valid.
                });
                results.push({ id, output: { category, domain, usedEngine: engine } });
            }
            return { results };
        } else if (engine === "ollama") {
            // Ollama is local — surface the failure rather than silently
            // reclassifying with regex (matches single-item classify() behaviour).
            return { results: [] };
        }
        // Cloud BYOK batch failed — fall back to regex below.
    }

    // Regex fallback: fast synchronous classification, no network calls.
    const results: Array<{ id: string; output: ClassifyOutput }> = [];
    for (const { id, url, title } of items) {
        const category = classifyByRegex(url, title);
        await persistMeta(id, category, "regex").catch(() => { });
        results.push({ id, output: { category, usedEngine: "regex" } });
    }
    return { results };
}

/**
 * Determine which classification engine would be used for the given BYOK
 * engine setting, without actually running a classification.
 *
 * Returns "regex" when BYOK is unavailable or not configured.
 */
export async function getActiveEngine(
    preferredEngine: BYOKEngine = "openai",
): Promise<ClassifyEngine> {
    const available = await isByokAvailable(preferredEngine);
    return available ? preferredEngine : "regex";
}

/**
 * Returns the first configured BYOK engine in priority order:
 * ollama → openai → anthropic → gemini.
 *
 * Falls back to "openai" (which will itself fall back to regex) if none is
 * configured — callers should handle the regex-fallback case gracefully.
 */
const ENGINE_PRIORITY: BYOKEngine[] = ["ollama", "openai", "anthropic", "gemini"];

export async function getBestAvailableEngine(): Promise<BYOKEngine> {
    for (const engine of ENGINE_PRIORITY) {
        if (await isByokAvailable(engine)) return engine;
    }
    return "openai";
}
