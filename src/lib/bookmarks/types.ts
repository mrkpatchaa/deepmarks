/**
 * Core shared types for Deepmarks.
 *
 * These are the canonical data contracts used throughout the extension
 * and in the companion daemon. No runtime code lives here — pure types only.
 */

/**
 * The 8 built-in classification categories.
 * Stored in IndexedDB only — never written back to native bookmark titles.
 */
export type Category =
    | "tool"
    | "security"
    | "technique"
    | "launch"
    | "research"
    | "opinion"
    | "commerce"
    | "other";

/**
 * Which engine produced the classification.
 * 'regex' is always available; the others require a BYOK key.
 */
export type ClassifyEngine = "regex" | "openai" | "anthropic" | "gemini" | "ollama";

/**
 * Classification metadata attached to a bookmark.
 * Stored in the IndexedDB 'bookmarks' store alongside the node data.
 */
export interface BookmarkMeta {
    category: Category | undefined;
    tags: string[];
    classifiedAt: number | undefined;
    classifiedBy: ClassifyEngine;
}

/**
 * A bookmark node as stored in Deepmarks' IndexedDB.
 *
 * SECURITY INVARIANT:
 *   - `url` is ONLY set when the value passes the `https?://` Zod allowlist.
 *     `javascript:`, `data:`, `file:`, `chrome:` and all other schemes are
 *     rejected at the sync boundary (Task 1.3) — stored as `undefined`.
 *   - `title` is stored as plain text; it is NEVER rendered via innerHTML.
 *   - `meta` is classified data; never exposed to content scripts.
 *
 * CALLER CONTRACT for `upsertBookmark`:
 *   Every value MUST have been validated through `RawBookmarkNodeSchema` (Zod)
 *   before reaching the storage layer. Do NOT write raw chrome.bookmarks data.
 */
export interface BookmarkNode {
    /** Native Chrome bookmark ID (opaque string). */
    id: string;
    /** Display title — stored as plain text, never as HTML. */
    title: string;
    /**
     * URL validated to https?:// only.
     * undefined for folder nodes or any bookmark whose URL fails validation.
     */
    url: string | undefined;
    /** Parent folder ID; undefined for root nodes. */
    parentId: string | undefined;
    /** Unix timestamp (ms) when the bookmark was created. */
    dateAdded: number;
    /** Classification metadata; undefined until classified. */
    meta: BookmarkMeta | undefined;
}

/**
 * Search result returned by the FlexSearch query wrapper.
 */
export interface SearchResult {
    bookmark: BookmarkNode;
    score: number;
}

/**
 * Generic Result type used by all async operations in this codebase.
 *
 * Functions that return `Promise<Result<T>>` NEVER throw.
 * Errors are surfaced as `{ ok: false, error: string }`.
 */
export type Result<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/** Convenience helpers for constructing Result values. */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: string): Result<never> => ({ ok: false, error });
