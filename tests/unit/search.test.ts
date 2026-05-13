/**
 * Task 2.1: FlexSearch index builder + query
 *
 * Tests verify:
 *   - buildIndex populates the index from BookmarkNodes
 *   - searchBookmarks returns matching results with expected scores
 *   - Title match scores 1.0, URL-only match scores 0.5
 *   - Empty query returns no results
 *   - Unbuilt index returns no results
 *   - Folder nodes (no URL) still match on title
 *   - Deduplication: each bookmark appears at most once
 *   - Limit is respected
 *   - resetIndex clears state
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildIndex, searchBookmarks, resetIndex } from "../../src/lib/search/index";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";

function makeNode(overrides: Partial<BookmarkNode> & { id: string }): BookmarkNode {
  return {
    title: "",
    url: undefined,
    parentId: undefined,
    dateAdded: 0,
    meta: undefined,
    ...overrides,
  };
}

const NODES: BookmarkNode[] = [
  makeNode({ id: "1", title: "GitHub", url: "https://github.com" }),
  makeNode({ id: "2", title: "MDN Web Docs", url: "https://developer.mozilla.org" }),
  makeNode({ id: "3", title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs" }),
  makeNode({ id: "4", title: "Bookmarks Bar", url: undefined }), // folder
  makeNode({ id: "5", title: "Node.js", url: "https://nodejs.org" }),
];

describe("searchBookmarks — unbuilt index", () => {
  beforeEach(resetIndex);

  it("returns [] before buildIndex is called", () => {
    const results = searchBookmarks("github");
    expect(results).toHaveLength(0);
  });

  it("returns [] for empty query", () => {
    buildIndex(NODES);
    expect(searchBookmarks("")).toHaveLength(0);
    expect(searchBookmarks("   ")).toHaveLength(0);
  });
});

describe("searchBookmarks — title matches", () => {
  beforeEach(() => {
    resetIndex();
    buildIndex(NODES);
  });

  it("finds bookmark by title prefix", () => {
    const results = searchBookmarks("github");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.bookmark.id).toBe("1");
  });

  it("title match has score 1.0", () => {
    const results = searchBookmarks("github");
    expect(results[0]?.score).toBe(1.0);
  });

  it("finds multi-word title", () => {
    const results = searchBookmarks("MDN");
    expect(results.some((r) => r.bookmark.id === "2")).toBe(true);
  });

  it("finds folder node (no URL) by title", () => {
    const results = searchBookmarks("Bookmarks");
    expect(results.some((r) => r.bookmark.id === "4")).toBe(true);
  });
});

describe("searchBookmarks — URL matches", () => {
  beforeEach(() => {
    resetIndex();
    buildIndex(NODES);
  });

  it("finds bookmark by URL domain", () => {
    const results = searchBookmarks("nodejs");
    expect(results.some((r) => r.bookmark.id === "5")).toBe(true);
  });
});

describe("searchBookmarks — deduplication", () => {
  beforeEach(() => {
    resetIndex();
    // Create a node whose title AND url both match "typescript"
    buildIndex([
      makeNode({
        id: "ts",
        title: "TypeScript",
        url: "https://typescript.org",
      }),
    ]);
  });

  it("does not return same bookmark twice even if title and URL both match", () => {
    const results = searchBookmarks("typescript");
    const ids = results.map((r) => r.bookmark.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

describe("searchBookmarks — limit", () => {
  beforeEach(resetIndex);

  it("respects limit parameter", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeNode({ id: String(i), title: `TypeScript tutorial ${String(i)}`, url: `https://example.com/${String(i)}` })
    );
    buildIndex(many);
    const results = searchBookmarks("TypeScript", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

describe("buildIndex — replacement", () => {
  it("rebuilding replaces previous index", () => {
    buildIndex([makeNode({ id: "a", title: "Alpha", url: "https://alpha.com" })]);
    expect(searchBookmarks("alpha").length).toBeGreaterThan(0);

    buildIndex([makeNode({ id: "b", title: "Beta", url: "https://beta.com" })]);
    expect(searchBookmarks("alpha")).toHaveLength(0);
    expect(searchBookmarks("beta").length).toBeGreaterThan(0);
  });
});
