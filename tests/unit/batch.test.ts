/**
 * Tests for the batch classifier (classifyAll).
 *
 * Covers:
 *  1. Empty bookmarks → returns {done:0, total:0, failed:0}
 *  2. Skips already-classified bookmarks by default
 *  3. forceReclassify=true re-classifies existing categories
 *  4. Skips bookmarks with no URL or non-http URL
 *  5. Progress callback is called after each batch
 *  6. AbortSignal stops processing mid-batch
 *  7. Failed classify() calls are counted in `failed`, not thrown
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { closeDb, clearAllBookmarks, upsertBookmark } from "../../src/lib/storage/db";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";
import { classifyAll } from "../../src/lib/classify/batch";

// ── helpers ────────────────────────────────────────────────────────────────

function makeBookmark(overrides: Partial<BookmarkNode> & { id: string }): BookmarkNode {
    return {
        title: "Test Bookmark",
        url: "https://example.com",
        parentId: undefined,
        dateAdded: Date.now(),
        meta: undefined,
        ...overrides,
    };
}

const neverSignal = new AbortController().signal; // never aborted

// ── mock classify router ───────────────────────────────────────────────────

vi.mock("../../src/lib/classify/router", () => ({
    getActiveEngine: vi.fn().mockResolvedValue("regex"),
    classify: vi.fn().mockResolvedValue({ ok: true, value: { category: "tool", usedEngine: "regex" } }),
}));

import { classify, getActiveEngine } from "../../src/lib/classify/router";
const mockClassify = vi.mocked(classify);
const mockGetActiveEngine = vi.mocked(getActiveEngine);

// ── tests ─────────────────────────────────────────────────────────────────

describe("classifyAll", () => {
    beforeEach(async () => {
        closeDb();
        await clearAllBookmarks();
        vi.clearAllMocks();
        mockClassify.mockResolvedValue({ ok: true, value: { category: "tool", usedEngine: "regex" } });
        mockGetActiveEngine.mockResolvedValue("regex");
    });

    it("1. returns zero progress for empty input", async () => {
        const progress: { done: number; total: number; failed: number }[] = [];
        const result = await classifyAll([], "openai", (p) => { progress.push(p); }, neverSignal);
        expect(result).toEqual({ done: 0, total: 0, failed: 0 });
        expect(progress).toHaveLength(1);
        expect(progress[0]).toEqual({ done: 0, total: 0, failed: 0 });
    });

    it("2. skips already-classified bookmarks", async () => {
        const bookmarks: BookmarkNode[] = [
            makeBookmark({ id: "a", meta: { category: "tool", tags: [], classifiedBy: "regex" } }),
            makeBookmark({ id: "b", url: "https://arxiv.org/test" }),
        ];
        const result = await classifyAll(bookmarks, "openai", () => { }, neverSignal);
        expect(result.total).toBe(1); // only unclassified
        expect(mockClassify).toHaveBeenCalledTimes(1);
        expect(mockClassify).toHaveBeenCalledWith("b", "https://arxiv.org/test", "Test Bookmark", "openai");
    });

    it("3. forceReclassify=true re-classifies already-classified bookmarks", async () => {
        const bookmarks: BookmarkNode[] = [
            makeBookmark({ id: "a", meta: { category: "tool", tags: [], classifiedBy: "regex" } }),
            makeBookmark({ id: "b" }),
        ];
        const result = await classifyAll(bookmarks, "openai", () => { }, neverSignal, true);
        expect(result.total).toBe(2);
        expect(mockClassify).toHaveBeenCalledTimes(2);
    });

    it("4. skips bookmarks with no URL or non-http/https URL", async () => {
        const bookmarks: BookmarkNode[] = [
            makeBookmark({ id: "a", url: undefined }),
            makeBookmark({ id: "b", url: "javascript:void(0)" }),
            makeBookmark({ id: "c", url: "https://valid.com" }),
        ];
        const result = await classifyAll(bookmarks, "openai", () => { }, neverSignal);
        expect(result.total).toBe(1);
        expect(mockClassify).toHaveBeenCalledTimes(1);
    });

    it("5. progress callback is called after each chunk", async () => {
        const bookmarks: BookmarkNode[] = Array.from({ length: 10 }, (_, i) =>
            makeBookmark({ id: String(i), url: `https://example${String(i)}.com` }),
        );
        const snapshots: number[] = [];
        await classifyAll(bookmarks, "openai", (p) => { snapshots.push(p.done); }, neverSignal);
        // With concurrency 5 (regex), we get 2 chunks: done=5 then done=10
        expect(snapshots).toEqual([5, 10]);
    });

    it("6. AbortSignal stops processing after current chunk", async () => {
        const abort = new AbortController();
        const bookmarks: BookmarkNode[] = Array.from({ length: 10 }, (_, i) =>
            makeBookmark({ id: String(i), url: `https://example${String(i)}.com` }),
        );
        // Abort after first chunk finishes
        let callCount = 0;
        mockClassify.mockImplementation(async () => {
            callCount += 1;
            if (callCount >= 5) abort.abort();
            return { ok: true, value: { category: "tool", usedEngine: "regex" } };
        });
        const result = await classifyAll(bookmarks, "openai", () => { }, abort.signal);
        // Should have stopped after the first chunk of 5
        expect(result.done).toBe(5);
        expect(mockClassify).toHaveBeenCalledTimes(5);
    });

    it("7. failed classify() calls are counted, not thrown", async () => {
        const bookmarks: BookmarkNode[] = [
            makeBookmark({ id: "a", url: "https://a.com" }),
            makeBookmark({ id: "b", url: "https://b.com" }),
        ];
        mockClassify
            .mockResolvedValueOnce({ ok: false, error: "network error" })
            .mockResolvedValueOnce({ ok: true, value: { category: "tool", usedEngine: "regex" } });
        const result = await classifyAll(bookmarks, "openai", () => { }, neverSignal);
        expect(result.failed).toBe(1);
        expect(result.done).toBe(2); // both processed, one failed
    });
});
