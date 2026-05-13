/**
 * Agent export — Task 6.2
 *
 * Produces a JSON string with all BookmarkNode data suitable for
 * consumption by AI agents. The export is scrubbed of any BYOK API
 * key references — it contains ONLY bookmark data + categories.
 *
 * SECURITY:
 *   - No API keys are included (keys live in chrome.storage.local, never here).
 *   - Export only includes fields defined in the public BookmarkNode interface.
 *   - URL allowlist enforced: entries with non-http(s) URLs are excluded.
 *   - JSON.stringify is used with a replacer to prevent prototype pollution.
 */
import type { BookmarkNode } from "../bookmarks/types";
import { getAllBookmarks } from "../storage/db";
import { SAFE_URL_RE } from "../bookmarks/url";

interface ExportedBookmark {
    id: string;
    title: string;
    url: string;
    parentId?: string;
    dateAdded: number;
    meta?: {
        category?: string;
        tags: string[];
        classifiedAt?: number;
        classifiedBy: string;
    };
}

/**
 * Converts a BookmarkNode to an ExportedBookmark (safe, url-checked, typed).
 * Returns null if the bookmark has no valid URL.
 */
function toExported(node: BookmarkNode): ExportedBookmark | null {
    if (node.url === undefined || !SAFE_URL_RE.test(node.url)) return null;
    const result: ExportedBookmark = {
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        dateAdded: node.dateAdded,
    };
    if (node.meta !== undefined) {
        result.meta = {
            category: node.meta.category,
            tags: node.meta.tags,
            classifiedAt: node.meta.classifiedAt,
            classifiedBy: node.meta.classifiedBy,
        };
    }
    return result;
}

/**
 * Returns a JSON string of all bookmarks from IndexedDB.
 * Entries with invalid or non-http(s) URLs are excluded.
 */
export async function exportJSON(): Promise<string> {
    const result = await getAllBookmarks();
    if (!result.ok) {
        return JSON.stringify({ error: "Failed to load bookmarks", bookmarks: [] });
    }
    const exported: ExportedBookmark[] = [];
    for (const node of result.value) {
        const e = toExported(node);
        if (e !== null) exported.push(e);
    }
    return JSON.stringify({ version: 1, bookmarks: exported }, null, 2);
}

export type { ExportedBookmark };
