/**
 * RED — Task 1.1: Core types
 *
 * These tests validate the TypeScript types compile correctly and have the
 * expected structure. Since types are erased at runtime, this test file
 * primarily exercises the type contract through assignments and type assertions.
 */
import { describe, it, expect } from "vitest";
import type {
  BookmarkNode,
  BookmarkMeta,
  Category,
  ClassifyEngine,
} from "../../src/lib/bookmarks/types";

describe("BookmarkNode type", () => {
  it("has required string fields", () => {
    const node: BookmarkNode = {
      id: "1",
      title: "GitHub",
      url: "https://github.com",
      parentId: "0",
      dateAdded: Date.now(),
      meta: undefined,
    };
    expect(node.id).toBe("1");
    expect(node.title).toBe("GitHub");
    expect(node.url).toBe("https://github.com");
  });

  it("allows undefined url (folder nodes)", () => {
    const folder: BookmarkNode = {
      id: "0",
      title: "Bookmarks Bar",
      url: undefined,
      parentId: undefined,
      dateAdded: Date.now(),
      meta: undefined,
    };
    expect(folder.url).toBeUndefined();
    expect(folder.parentId).toBeUndefined();
  });

  it("has correct meta structure when present", () => {
    const meta: BookmarkMeta = {
      category: "tool",
      tags: ["dev", "code"],
      classifiedAt: Date.now(),
      classifiedBy: "regex",
    };
    const node: BookmarkNode = {
      id: "2",
      title: "VS Code",
      url: "https://code.visualstudio.com",
      parentId: "1",
      dateAdded: Date.now(),
      meta,
    };
    expect(node.meta?.category).toBe("tool");
    expect(node.meta?.classifiedBy).toBe("regex");
    expect(node.meta?.tags).toHaveLength(2);
  });
});

describe("Category type", () => {
  it("accepts all 8 valid category values", () => {
    const categories: Category[] = [
      "tool",
      "security",
      "technique",
      "launch",
      "research",
      "opinion",
      "commerce",
      "other",
    ];
    expect(categories).toHaveLength(8);
    // Runtime guard: every value is a known string
    categories.forEach((c) => expect(typeof c).toBe("string"));
  });
});

describe("ClassifyEngine type", () => {
  it("accepts all 4 valid engine values", () => {
    const engines: ClassifyEngine[] = [
      "regex",
      "openai",
      "anthropic",
      "gemini",
    ];
    expect(engines).toHaveLength(4);
    engines.forEach((e) => expect(typeof e).toBe("string"));
  });
});

describe("BookmarkMeta type", () => {
  it("allows all optional fields to be undefined except tags", () => {
    const meta: BookmarkMeta = {
      category: undefined,
      tags: [],
      classifiedAt: undefined,
      classifiedBy: "regex",
    };
    expect(meta.category).toBeUndefined();
    expect(meta.tags).toHaveLength(0);
    expect(meta.classifiedAt).toBeUndefined();
  });
});
