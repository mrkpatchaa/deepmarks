/**
 * IndexedDB storage layer for Deepmarks.
 *
 * SECURITY CONTRACT:
 *   - This module never validates URLs or bookmark data. All validation MUST
 *     happen at the sync boundary (Task 1.3 — src/lib/bookmarks/sync.ts).
 *   - Never call upsertBookmark with raw chrome.bookmarks data.
 *   - All exported functions return Promise<Result<T>> and never throw.
 *
 * SCHEMA (v1):
 *   Store "bookmarks" — keyPath: "id" (string)
 *     No additional indices in v1 (full-text search handled by FlexSearch).
 */

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { BookmarkNode } from "../bookmarks/types";
import { ok, err } from "../bookmarks/types";
import type { Result } from "../bookmarks/types";

/** Typed schema keeps all DB operations fully typed with no `any` casts. */
interface DeepmarksSchema extends DBSchema {
    bookmarks: {
        key: string;
        value: BookmarkNode;
    };
}

const DB_NAME = "deepmarks";
const DB_VERSION = 1;

/** Lazily-opened singleton DB connection. */
let _db: IDBPDatabase<DeepmarksSchema> | null = null;

/**
 * Open (or return the cached) IndexedDB connection.
 * Creates the schema on first open / version upgrade.
 */
export async function openDb(): Promise<IDBPDatabase<DeepmarksSchema>> {
    if (_db !== null) return _db;

    _db = await openDB<DeepmarksSchema>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                db.createObjectStore("bookmarks", { keyPath: "id" });
            }
        },
    });

    return _db;
}

/**
 * Insert or replace a bookmark.
 * Uses `put` so an existing record with the same `id` is overwritten.
 */
export async function upsertBookmark(
    node: BookmarkNode
): Promise<Result<void>> {
    try {
        const db = await openDb();
        await db.put("bookmarks", node);
        return ok(undefined);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Retrieve all bookmarks from the store.
 * Returns an empty array if the store is empty.
 */
export async function getAllBookmarks(): Promise<Result<BookmarkNode[]>> {
    try {
        const db = await openDb();
        const all = await db.getAll("bookmarks");
        return ok(all);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Retrieve a single bookmark by its native Chrome ID.
 * Returns `undefined` (not an error) when the ID is not found.
 */
export async function getBookmarkById(
    id: string
): Promise<Result<BookmarkNode | undefined>> {
    try {
        const db = await openDb();
        const record = await db.get("bookmarks", id);
        return ok(record);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Remove a bookmark by ID.
 * Idempotent — returns ok:true even if the ID does not exist.
 */
export async function deleteBookmark(id: string): Promise<Result<void>> {
    try {
        const db = await openDb();
        await db.delete("bookmarks", id);
        return ok(undefined);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Delete ALL bookmarks from the store (used during full re-sync).
 */
export async function clearAllBookmarks(): Promise<Result<void>> {
    try {
        const db = await openDb();
        await db.clear("bookmarks");
        return ok(undefined);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Retrieve a page of bookmarks using a key-range cursor (Task 3.1).
 *
 * @param startAfterKey - Primary key to start after (exclusive).
 *   Pass `undefined` for the first page.
 * @param limit - Maximum number of records to return. Default 200.
 *
 * When the returned array length < limit, there are no more pages.
 */
export async function getBookmarkPage(
    startAfterKey: string | undefined,
    limit = 200,
): Promise<Result<BookmarkNode[]>> {
    try {
        const db = await openDb();
        const range =
            startAfterKey !== undefined
                ? IDBKeyRange.lowerBound(startAfterKey, true)
                : undefined;
        const tx = db.transaction("bookmarks", "readonly");
        const records = await tx.store.getAll(range, limit);
        return ok(records);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Count total bookmarks and per-category breakdown.
 *
 * Returns accurate counts in a single IDB scan without holding all records
 * in React state.  Used by the side panel to populate category pill counts
 * immediately on open, independent of cursor-based pagination.
 */
export async function getBookmarkCounts(): Promise<Result<{
    all: number;
    tool: number;
    security: number;
    technique: number;
    launch: number;
    research: number;
    opinion: number;
    commerce: number;
    other: number;
}>> {
    try {
        const db = await openDb();
        const all = await db.getAll("bookmarks");
        const counts = {
            all: all.length,
            tool: 0,
            security: 0,
            technique: 0,
            launch: 0,
            research: 0,
            opinion: 0,
            commerce: 0,
            other: 0,
        };
        for (const bm of all) {
            const cat = bm.meta?.category;
            if (cat === "tool") counts.tool++;
            else if (cat === "security") counts.security++;
            else if (cat === "technique") counts.technique++;
            else if (cat === "launch") counts.launch++;
            else if (cat === "research") counts.research++;
            else if (cat === "opinion") counts.opinion++;
            else if (cat === "commerce") counts.commerce++;
            else counts.other++;
        }
        return ok(counts);
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Per-category counts plus top-N link domains for the Stats tab.
 * Does a single IDB scan to avoid multiple round-trips.
 */
export interface StatsData {
    total: number;
    /** Bookmarks that have an explicit meta.category assigned. */
    classified: number;
    /** Sorted descending by count, only categories with count > 0. */
    categories: { name: string; count: number }[];
    /** Top link domains (hostname without leading www.) sorted by count. */
    topDomains: { domain: string; count: number }[];
}

/**
 * Compute overview stats in a single IDB scan.
 *
 * @param domainLimit - Maximum number of link domains to return.  Default 15.
 */
export async function getStatsData(domainLimit = 15): Promise<Result<StatsData>> {
    try {
        const db = await openDb();
        const all = await db.getAll("bookmarks");

        let classified = 0;
        const catCounts = new Map<string, number>();
        const domainCounts = new Map<string, number>();

        for (const bm of all) {
            // Track explicitly-classified bookmarks
            if (bm.meta?.category !== undefined) {
                classified++;
                const cat = bm.meta.category;
                catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
            }

            // Extract link domain from URL
            if (bm.url) {
                try {
                    const host = new URL(bm.url).hostname.replace(/^www\./, "");
                    if (host) {
                        domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
                    }
                } catch {
                    // Invalid URL — skip
                }
            }
        }

        const categories = [...catCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));

        const topDomains = [...domainCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, domainLimit)
            .map(([domain, count]) => ({ domain, count }));

        return ok({ total: all.length, classified, categories, topDomains });
    } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
    }
}

/**
 * Close the current DB connection and clear the cached instance.
 *
 * Use this in tests to reset state between test runs, or if the DB version
 * needs to be bumped.  Not needed in production — the service worker lifetime
 * manages cleanup automatically.
 */
export function closeDb(): void {
    if (_db !== null) {
        _db.close();
        _db = null;
    }
}
