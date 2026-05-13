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
