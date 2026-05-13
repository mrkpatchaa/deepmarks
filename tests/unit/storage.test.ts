/**
 * Task 1.2: IndexedDB schema + bookmark CRUD
 *
 * Uses fake-indexeddb to exercise the storage layer in a real jsdom environment.
 * Each describe block starts with a fresh DB + fresh IDB factory to guarantee
 * test isolation despite the module-level DB singleton.
 *
 * fake-indexeddb/auto is loaded in tests/setup.ts which registers all globals
 * (IDBRequest, IDBKeyRange, IDBDatabase, …) once at setup time.
 * Here we only replace globalThis.indexedDB with a NEW IDBFactory per test
 * to start with an empty database.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  openDb,
  upsertBookmark,
  getAllBookmarks,
  getBookmarkById,
  deleteBookmark,
  closeDb,
} from "../../src/lib/storage/db";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";

/** Reset both the module singleton and the IDB factory for test isolation. */
function resetDb(): void {
  closeDb();
  globalThis.indexedDB = new IDBFactory();
}

const makeBookmark = (overrides: Partial<BookmarkNode> = {}): BookmarkNode => ({
  id: "bm_1",
  title: "Example",
  url: "https://example.com",
  parentId: "0",
  dateAdded: 1700000000000,
  meta: undefined,
  ...overrides,
});

describe("openDb", () => {
  beforeEach(resetDb);

  it("returns a DB instance without throwing", async () => {
    const db = await openDb();
    expect(db).toBeDefined();
    // Do NOT call db.close() — it's a singleton; closing it breaks other tests.
  });
});

describe("upsertBookmark", () => {
  beforeEach(resetDb);

  it("inserts a new bookmark and returns ok:true", async () => {
    const bm = makeBookmark();
    const result = await upsertBookmark(bm);
    expect(result.ok).toBe(true);
  });

  it("updates an existing bookmark on re-upsert", async () => {
    const bm = makeBookmark();
    await upsertBookmark(bm);
    const updated = makeBookmark({ title: "Updated Example" });
    const result = await upsertBookmark(updated);
    expect(result.ok).toBe(true);

    const fetched = await getBookmarkById("bm_1");
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.value?.title).toBe("Updated Example");
    }
  });
});

describe("getAllBookmarks", () => {
  beforeEach(resetDb);

  it("returns empty array when DB is empty", async () => {
    const result = await getAllBookmarks();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("returns all inserted bookmarks", async () => {
    await upsertBookmark(makeBookmark({ id: "a" }));
    await upsertBookmark(makeBookmark({ id: "b" }));
    await upsertBookmark(makeBookmark({ id: "c" }));

    const result = await getAllBookmarks();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });
});

describe("getBookmarkById", () => {
  beforeEach(resetDb);

  it("returns undefined for a non-existent ID", async () => {
    const result = await getBookmarkById("nonexistent");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("returns the correct bookmark by ID", async () => {
    const bm = makeBookmark({ id: "target", title: "Target Bookmark" });
    await upsertBookmark(bm);

    const result = await getBookmarkById("target");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.id).toBe("target");
      expect(result.value?.title).toBe("Target Bookmark");
    }
  });
});

describe("deleteBookmark", () => {
  beforeEach(resetDb);

  it("removes an existing bookmark", async () => {
    await upsertBookmark(makeBookmark({ id: "del_me" }));
    const deleteResult = await deleteBookmark("del_me");
    expect(deleteResult.ok).toBe(true);

    const fetchResult = await getBookmarkById("del_me");
    expect(fetchResult.ok).toBe(true);
    if (fetchResult.ok) {
      expect(fetchResult.value).toBeUndefined();
    }
  });

  it("returns ok:true when deleting a non-existent ID (idempotent)", async () => {
    const result = await deleteBookmark("does_not_exist");
    expect(result.ok).toBe(true);
  });
});
