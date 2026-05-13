/**
 * Tests for Task 6.1: wiki compiler.
 *
 *  1. Empty input returns header only
 *  2. Uncategorized bookmark appears under ## Other
 *  3. Each category section has the correct heading
 *  4. Bookmark link appears as markdown link with title and url
 *  5. Empty categories are omitted (no empty ## section)
 *  6. Cross-links appear for non-empty categories
 *  7. javascript: URLs are omitted from output
 *  8. data: URLs are omitted from output
 *  9. Titles with ] and [ chars are sanitized
 * 10. Compile 50 classified bookmarks — markdown structure assertion
 *
 * Tests for Task 6.2: exportJSON
 * 11. exportJSON returns valid JSON with version + bookmarks array
 * 12. exportJSON excludes entries with non-http(s) URLs
 * 13. exportJSON output parses correctly with JSON.parse
 */
import { describe, it, expect, beforeEach } from "vitest";
import { compileWiki } from "../../src/lib/wiki/compile";
import { exportJSON } from "../../src/lib/agent/export";
import { upsertBookmark, closeDb, clearAllBookmarks } from "../../src/lib/storage/db";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";

function bm(
  id: string,
  title: string,
  url: string,
  category?: string,
): BookmarkNode {
  return {
    id,
    title,
    url,
    parentId: "1",
    dateAdded: Date.now(),
    meta: category !== undefined
      ? { category: category as NonNullable<BookmarkNode["meta"]>["category"], classifiedAt: Date.now(), classifiedBy: "regex", tags: [] }
      : undefined,
  };
}

describe("compileWiki — empty input", () => {
  it("returns header and nothing else for empty array", () => {
    const out = compileWiki([]);
    expect(out).toContain("# Deepmarks Wiki");
    expect(out).toContain("<!-- generated");
  });
});

describe("compileWiki — section rendering", () => {
  it("renders bookmark under ## Tool for tool category", () => {
    const out = compileWiki([bm("1", "My Tool", "https://mytool.io", "tool")]);
    expect(out).toContain("## Tool");
    expect(out).toContain("- [My Tool](https://mytool.io)");
  });

  it("renders uncategorized bookmark under ## Other", () => {
    const out = compileWiki([bm("2", "Unknown", "https://unknown.io", "other")]);
    expect(out).toContain("## Other");
    expect(out).toContain("- [Unknown](https://unknown.io)");
  });

  it("renders missing meta category as other", () => {
    const node: BookmarkNode = {
      id: "3",
      title: "No meta",
      url: "https://nometa.io",
      parentId: "1",
      dateAdded: Date.now(),
      meta: undefined,
    };
    const out = compileWiki([node]);
    expect(out).toContain("## Other");
    expect(out).toContain("- [No meta](https://nometa.io)");
  });
});

describe("compileWiki — empty categories omitted", () => {
  it("does not render a ## heading for a category with no bookmarks", () => {
    const out = compileWiki([bm("1", "A Tool", "https://a.io", "tool")]);
    // All categories except 'tool' should be absent
    expect(out).not.toContain("## Security");
    expect(out).not.toContain("## Research");
    expect(out).not.toContain("## Launch");
    expect(out).not.toContain("## Commerce");
    expect(out).not.toContain("## Opinion");
    expect(out).not.toContain("## Technique");
    expect(out).not.toContain("## Other");
  });
});

describe("compileWiki — cross-links", () => {
  it("renders See also links for other non-empty categories", () => {
    const out = compileWiki([
      bm("1", "A Tool", "https://a.io", "tool"),
      bm("2", "A Research", "https://b.io", "research"),
    ]);
    // tool section should reference research
    const toolSection = out.slice(out.indexOf("## Tool"));
    expect(toolSection).toContain("[[research]]");
    // research section should reference tool
    const researchSection = out.slice(out.indexOf("## Research"));
    expect(researchSection).toContain("[[tool]]");
  });
});

describe("compileWiki — URL security", () => {
  it("omits javascript: URLs", () => {
    const out = compileWiki([bm("1", "XSS", "javascript:alert(1)", "tool")]);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("XSS");
  });

  it("omits data: URLs", () => {
    const out = compileWiki([bm("1", "Data", "data:text/html,<h1>hi</h1>", "tool")]);
    expect(out).not.toContain("data:");
  });
});

describe("compileWiki — title sanitization", () => {
  it("removes [ and ] from titles to prevent broken markdown links", () => {
    const out = compileWiki([bm("1", "My [Tool] Here", "https://t.io", "tool")]);
    expect(out).not.toContain("[Tool]");
    expect(out).toContain("My Tool Here");
  });
});

describe("compileWiki — 50 bookmarks performance and structure", () => {
  it("compiles 50 classified bookmarks and has correct headings", () => {
    const categories = ["tool", "security", "technique", "launch", "research", "opinion", "commerce", "other"] as const;
    const bookmarks: BookmarkNode[] = [];
    for (let i = 0; i < 50; i++) {
      const cat = categories[i % categories.length]!;
      bookmarks.push(bm(String(i), `Bookmark ${String(i)}`, `https://example.com/${String(i)}`, cat));
    }
    const out = compileWiki(bookmarks);
    // All 8 categories should appear (each has ~6-7 items)
    expect(out).toContain("## Tool");
    expect(out).toContain("## Security");
    expect(out).toContain("## Technique");
    expect(out).toContain("## Launch");
    expect(out).toContain("## Research");
    expect(out).toContain("## Opinion");
    expect(out).toContain("## Commerce");
    expect(out).toContain("## Other");
    // All 50 links should be present
    for (let i = 0; i < 50; i++) {
      expect(out).toContain(`https://example.com/${String(i)}`);
    }
  });
});

// ── Task 6.2: exportJSON ───────────────────────────────────────────────────

describe("exportJSON", () => {
  beforeEach(() => {
    closeDb();
    void clearAllBookmarks();
  });

  it("returns valid JSON with version + bookmarks array for empty IDB", async () => {
    const json = await exportJSON();
    const parsed: unknown = JSON.parse(json);
    expect(typeof parsed).toBe("object");
    expect((parsed as { version: number }).version).toBe(1);
    expect(Array.isArray((parsed as { bookmarks: unknown[] }).bookmarks)).toBe(true);
  });

  it("includes bookmarks written to IDB", async () => {
    await upsertBookmark({
      id: "e1",
      title: "Export Test",
      url: "https://export-test.io",
      parentId: "1",
      dateAdded: Date.now(),
      meta: undefined,
    });
    const json = await exportJSON();
    const parsed = JSON.parse(json) as { version: number; bookmarks: { id: string; url: string }[] };
    expect(parsed.bookmarks.length).toBeGreaterThan(0);    const entry = parsed.bookmarks.find((b) => b.id === "e1");
    expect(entry).toBeDefined();
    expect(entry?.url).toBe("https://export-test.io");
  });

  it("excludes entries with undefined URLs from export", async () => {
    // folder node — url is undefined
    await upsertBookmark({
      id: "folder1",
      title: "Folder",
      url: undefined,
      parentId: "0",
      dateAdded: Date.now(),
      meta: undefined,
    });
    const json = await exportJSON();
    const parsed = JSON.parse(json) as { bookmarks: { id: string }[] };
    const entry = parsed.bookmarks.find((b) => b.id === "folder1");
    expect(entry).toBeUndefined();
  });
});
