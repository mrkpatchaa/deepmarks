/**
 * Tests for Task 3.1 — side panel data layer + BookmarkCard helpers.
 *
 * Covers:
 *   1. domainInitial: correct letter extraction + edge cases
 *   2. isSafeUrl: scheme allowlist enforcement
 *   3. getBookmarkPage: cursor-based pagination
 *   4. getBookmarkPage: performance — 1k and 10k bookmarks load in ≤ 200ms
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAllBookmarks,
  closeDb,
  getBookmarkPage,
  upsertBookmark,
} from "../../src/lib/storage/db";
import { domainInitial, isSafeUrl } from "../../src/lib/bookmarks/url";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBookmark(id: string, url?: string): BookmarkNode {
  return {
    id,
    title: "Bookmark " + id,
    url,
    parentId: "1",
    dateAdded: Date.now(),
    meta: undefined,
  };
}

async function populateDb(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const id = String(i).padStart(8, "0"); // lexicographic ordering stable
    await upsertBookmark(makeBookmark(id, "https://example.com/" + id));
  }
}

// ---------------------------------------------------------------------------
// domainInitial
// ---------------------------------------------------------------------------

describe("domainInitial", () => {
  it("extracts and uppercases the first hostname character", () => {
    expect(domainInitial("https://github.com/path")).toBe("G");
    expect(domainInitial("https://arxiv.org/abs/1234")).toBe("A");
    expect(domainInitial("http://example.com")).toBe("E");
  });

  it("handles www prefix correctly", () => {
    expect(domainInitial("https://www.google.com")).toBe("W");
  });

  it("returns '?' for undefined", () => {
    expect(domainInitial(undefined)).toBe("?");
  });

  it("returns '?' for empty string", () => {
    expect(domainInitial("")).toBe("?");
  });

  it("returns '?' for unparseable URL", () => {
    expect(domainInitial("not a url")).toBe("?");
  });

  it("returns '?' for javascript: URL", () => {
    // URL constructor parses javascript: but hostname is empty
    expect(domainInitial("javascript:alert(1)")).toBe("?");
  });
});

// ---------------------------------------------------------------------------
// isSafeUrl
// ---------------------------------------------------------------------------

describe("isSafeUrl", () => {
  it("accepts https:// URLs", () => {
    expect(isSafeUrl("https://github.com")).toBe(true);
  });

  it("accepts http:// URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("rejects undefined", () => {
    expect(isSafeUrl(undefined)).toBe(false);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  it("rejects file: URLs", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects chrome: URLs", () => {
    expect(isSafeUrl("chrome://settings")).toBe(false);
  });

  it("rejects ftp: URLs", () => {
    expect(isSafeUrl("ftp://files.example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBookmarkPage
// ---------------------------------------------------------------------------

describe("getBookmarkPage", () => {
  beforeEach(async () => {
    closeDb();
    // Clear any leftover data from previous tests in the same file.
    // fake-indexeddb persists data across test cases; clearAllBookmarks
    // opens a fresh connection and empties the store.
    await clearAllBookmarks();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns an empty array from an empty store", async () => {
    const result = await getBookmarkPage(undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it("returns the first page limited by the requested size", async () => {
    await populateDb(50);
    const result = await getBookmarkPage(undefined, 20);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(20);
  });

  it("returns the correct second page when startAfterKey is provided", async () => {
    await populateDb(10);
    // Page 1: first 5 records
    const page1 = await getBookmarkPage(undefined, 5);
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.value).toHaveLength(5);

    const lastKey = page1.value[page1.value.length - 1]?.id;
    expect(lastKey).toBeDefined();

    // Page 2: next 5 records (startAfterKey excludes the last item of page 1)
    const page2 = await getBookmarkPage(lastKey, 5);
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.value).toHaveLength(5);

    // No overlap between pages
    const page1Ids = new Set(page1.value.map((b) => b.id));
    for (const b of page2.value) {
      expect(page1Ids.has(b.id)).toBe(false);
    }
  });

  it("signals no-more-pages when returned length < limit", async () => {
    await populateDb(3);
    const result = await getBookmarkPage(undefined, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThan(10); // indicates last page
  });

  // ---------------------------------------------------------------------------
  // Performance tests
  // ---------------------------------------------------------------------------

  it("loads first page of 1,000 bookmarks in ≤ 200ms", async () => {
    await populateDb(1_000);
    const start = performance.now();
    const result = await getBookmarkPage(undefined, 200);
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(200);
    expect(elapsed).toBeLessThan(200);
  }, 10_000 /* generous test timeout */);

  it("loads first page of 10,000 bookmarks in ≤ 200ms", async () => {
    await populateDb(10_000);
    const start = performance.now();
    const result = await getBookmarkPage(undefined, 200);
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(200);
    expect(elapsed).toBeLessThan(200);
  }, 30_000 /* more time for 10k inserts */);
});
