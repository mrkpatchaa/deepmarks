/**
 * Task 1.3: Bookmark sync + Zod validation
 *
 * SECURITY FOCUS:
 *   - URL scheme allowlist: only http/https URLs are stored.
 *   - javascript:, data:, file:, chrome:, about:, ftp:, etc. → url: undefined
 *   - z.string().url() is NOT used (allows file:///, tel:, etc.)
 *   - All raw chrome.bookmarks data passes through RawBookmarkNodeSchema before storage.
 *   - Title and URL are treated as plain text — never rendered as HTML.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { validateRawBookmark } from "../../src/lib/bookmarks/sync";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";
import { closeDb } from "../../src/lib/storage/db";

function resetDb(): void {
  closeDb();
  globalThis.indexedDB = new IDBFactory();
}

describe("validateRawBookmark — URL scheme allowlist (SECURITY)", () => {
  it("accepts https:// URLs", () => {
    const result = validateRawBookmark({
      id: "1",
      title: "Example",
      url: "https://example.com",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBe("https://example.com");
  });

  it("accepts http:// URLs", () => {
    const result = validateRawBookmark({
      id: "2",
      title: "Insecure",
      url: "http://example.com",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBe("http://example.com");
  });

  it("rejects javascript: URLs → url: undefined", () => {
    const result = validateRawBookmark({
      id: "3",
      title: "XSS",
      url: "javascript:alert(1)",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("rejects data: URLs → url: undefined", () => {
    const result = validateRawBookmark({
      id: "4",
      title: "Data URI",
      url: "data:text/html,<script>alert(1)</script>",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("rejects file: URLs → url: undefined", () => {
    const result = validateRawBookmark({
      id: "5",
      title: "Local file",
      url: "file:///etc/passwd",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("rejects chrome: URLs → url: undefined", () => {
    const result = validateRawBookmark({
      id: "6",
      title: "Chrome extensions",
      url: "chrome://extensions",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("rejects ftp: URLs → url: undefined", () => {
    const result = validateRawBookmark({
      id: "7",
      title: "FTP",
      url: "ftp://files.example.com",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("handles bookmark folders (no url field) → url: undefined", () => {
    const result = validateRawBookmark({
      id: "8",
      title: "Bookmarks Bar",
      dateAdded: 1700000000000,
    });
    expect(result.url).toBeUndefined();
  });

  it("handles empty title gracefully → falls back to empty string", () => {
    const result = validateRawBookmark({
      id: "9",
      title: "",
      url: "https://example.com",
      dateAdded: 1700000000000,
    });
    expect(result.title).toBe("");
    expect(result.url).toBe("https://example.com");
  });

  it("coerces missing dateAdded to 0", () => {
    const result = validateRawBookmark({
      id: "10",
      title: "No date",
      url: "https://example.com",
    });
    expect(result.dateAdded).toBe(0);
  });
});

describe("syncAllBookmarks", () => {
  beforeEach(resetDb);

  it("flattens the bookmark tree and upserts all leaf nodes", async () => {
    const mockTree: chrome.bookmarks.BookmarkTreeNode[] = [
      {
        id: "0",
        title: "root",
        syncing: false,
        children: [
          {
            id: "1",
            title: "Bookmarks Bar",
            syncing: false,
            children: [
              { id: "2", title: "GitHub", url: "https://github.com", dateAdded: 1700000000000, syncing: false },
              { id: "3", title: "Local", url: "file:///etc/passwd", dateAdded: 1700000000001, syncing: false },
            ],
          },
          {
            id: "4",
            title: "Other",
            syncing: false,
            children: [
              { id: "5", title: "MDN", url: "https://developer.mozilla.org", dateAdded: 1700000000002, syncing: false },
            ],
          },
        ],
      },
    ];

    // tsc requires this cast to resolve the Promise overload (vs the void callback overload)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const getTreeCast = chrome.bookmarks.getTree as () => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
    vi.mocked(getTreeCast).mockResolvedValue(mockTree);

    const { syncAllBookmarks, getAllBookmarksFromDb } = await import(
      "../../src/lib/bookmarks/sync"
    );

    const result = await syncAllBookmarks();
    expect(result.ok).toBe(true);

    const all = await getAllBookmarksFromDb();
    expect(all.ok).toBe(true);
    if (all.ok) {
      // 5 nodes total: 3 leaf URLs + 2 folders (root + Bookmarks Bar + Other are folders)
      // All nodes are stored (including folders with url: undefined)
      const urls = all.value.map((b: BookmarkNode) => b.url);
      expect(urls).toContain("https://github.com");
      expect(urls).toContain("https://developer.mozilla.org");
      // file:// URL was sanitized to undefined
      const localFile = all.value.find((b: BookmarkNode) => b.id === "3");
      expect(localFile?.url).toBeUndefined();
    }
  });
});
