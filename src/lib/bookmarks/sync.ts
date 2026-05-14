/**
 * Bookmark sync — chrome.bookmarks → IndexedDB pipeline.
 *
 * SECURITY CONTRACT:
 *   - ALL data from chrome.bookmarks passes through `validateRawBookmark`
 *     before being written to IndexedDB. This is the ONLY place where raw
 *     browser data is sanitised.
 *   - URL allowlist: ONLY http:// and https:// are stored. Any other scheme
 *     (javascript:, data:, file:, chrome:, ftp:, about:, …) is stored as
 *     `url: undefined`. We intentionally use a regex rather than `new URL()`
 *     or Zod's `.url()` validator because those accept non-http schemes.
 *   - Title and parentId come from the browser and are stored as plain text.
 *     They are NEVER rendered via innerHTML or dangerouslySetInnerHTML.
 *   - This module does not throw. All async operations return Result<T>.
 */

import { z } from "zod";
import type { BookmarkNode } from "./types";
import type { Result } from "./types";
import { ok, err } from "./types";
import {
    upsertBookmark,
    getAllBookmarks,
    deleteBookmark,
} from "../storage/db";

// ---------------------------------------------------------------------------
// Zod schema for raw chrome.bookmarks data
// ---------------------------------------------------------------------------

/**
 * SECURITY: URL is accepted ONLY for http/https schemes.
 *
 * We deliberately avoid z.string().url() because it accepts schemes like
 * `file://`, `ftp://`, `tel:`, `mailto:`, etc.
 *
 * The regex is anchored and case-insensitive. Any URL that does not match
 * resolves to `undefined` — it is NOT an error.
 */
const SAFE_URL_REGEX = /^https?:\/\//i;

const SafeUrlSchema = z
    .string()
    .optional()
    .transform((raw) => {
        if (raw === undefined || raw === "") return undefined;
        return SAFE_URL_REGEX.test(raw) ? raw : undefined;
    });

/** Schema for a single node returned by chrome.bookmarks.getTree(). */
const RawBookmarkNodeSchema = z.object({
    id: z.string(),
    title: z.string().default(""),
    url: SafeUrlSchema,
    parentId: z.string().optional(),
    dateAdded: z.number().optional().default(0),
});

// The `children` field is not part of the schema — we traverse the tree
// recursively in `flattenTree` rather than trying to nest Zod schemas.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate and sanitise a single raw chrome.bookmarks node.
 *
 * - Strips unsafe URL schemes (returns url: undefined for non-http/https)
 * - Coerces missing `dateAdded` to 0
 * - Coerces missing `title` to ""
 * - Strips `meta` (never present in raw browser data) — set separately
 *
 * @returns A fully-formed BookmarkNode safe to persist to IndexedDB.
 */
export function validateRawBookmark(
    raw: Partial<chrome.bookmarks.BookmarkTreeNode>
): BookmarkNode {
    const parsed = RawBookmarkNodeSchema.parse(raw);
    return {
        id: parsed.id,
        title: parsed.title,
        url: parsed.url,
        parentId: parsed.parentId,
        dateAdded: parsed.dateAdded,
        meta: undefined,
    };
}

/**
 * Recursively flatten a bookmark tree into a flat array of BookmarkNode.
 * Folders (no url) and leaves (with url) are both included.
 */
function flattenTree(
    nodes: chrome.bookmarks.BookmarkTreeNode[]
): BookmarkNode[] {
    const result: BookmarkNode[] = [];
    for (const node of nodes) {
        result.push(validateRawBookmark(node));
        if (node.children && node.children.length > 0) {
            result.push(...flattenTree(node.children));
        }
    }
    return result;
}

/**
 * Perform a full sync of chrome.bookmarks → IndexedDB.
 *
 * Steps:
 *   1. Read existing IDB records into a Map to preserve classification metadata
 *   2. Fetch the entire bookmark tree via chrome.bookmarks.getTree()
 *   3. Flatten + validate all nodes through RawBookmarkNodeSchema
 *   4. Upsert each node, keeping any existing meta (category, tags, etc.)
 *   5. Delete IDB records whose IDs are no longer present in Chrome's tree
 *
 * Returns the count of nodes written.
 *
 * SECURITY NOTE:
 *   - No raw browser data reaches IndexedDB. Every node passes through
 *     `validateRawBookmark` which enforces the URL allowlist.
 *   - Only the `meta` field is carried over from the existing IDB record;
 *     all other fields (title, url, dateAdded) are always refreshed from Chrome.
 */
export async function syncAllBookmarks(): Promise<Result<{ count: number }>> {
    try {
        // Preserve existing classification metadata keyed by Chrome bookmark ID.
        const existingResult = await getAllBookmarks();
        if (!existingResult.ok) return existingResult;
        const existingById = new Map(existingResult.value.map((n) => [n.id, n]));

        const tree = await chrome.bookmarks.getTree();
        const nodes = flattenTree(tree);
        const chromeIds = new Set(nodes.map((n) => n.id));

        // Upsert each Chrome node, restoring meta from the previous IDB record.
        for (const node of nodes) {
            const existing = existingById.get(node.id);
            const upsertResult = await upsertBookmark({
                ...node,
                meta: existing?.meta,
            });
            if (!upsertResult.ok) return upsertResult;
        }

        // Remove IDB records for bookmarks that were deleted from Chrome.
        for (const id of existingById.keys()) {
            if (!chromeIds.has(id)) {
                const deleteResult = await deleteBookmark(id);
                if (!deleteResult.ok) return deleteResult;
            }
        }

        return ok({ count: nodes.length });
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Re-export getAllBookmarks with a domain-friendly alias.
 * Avoids test files needing to import from two places.
 */
export { getAllBookmarks as getAllBookmarksFromDb } from "../storage/db";

// ---------------------------------------------------------------------------
// Watcher — react to live bookmark mutations
// ---------------------------------------------------------------------------

/** Debounce delay (ms) for batching rapid bookmark events. */
const DEBOUNCE_MS = 500;

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a full re-sync, debounced to avoid hammering IndexedDB on rapid
 * bookmark mutations (e.g. importing a large bookmark file).
 */
function scheduleSyncDebounced(): void {
    if (_debounceTimer !== null) {
        clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        void syncAllBookmarks();
    }, DEBOUNCE_MS);
}

/** Whether the watcher listeners have been attached. */
let _watching = false;

/**
 * Attach event listeners to chrome.bookmarks.onCreated / onChanged / onRemoved.
 *
 * Safe to call multiple times — only attaches once.
 */
export function startWatcher(): void {
    if (_watching) return;
    _watching = true;

    chrome.bookmarks.onCreated.addListener(scheduleSyncDebounced);
    chrome.bookmarks.onChanged.addListener(scheduleSyncDebounced);
    chrome.bookmarks.onRemoved.addListener(scheduleSyncDebounced);
}
