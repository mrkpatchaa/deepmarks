/**
 * Full-text search index — Task 2.1
 *
 * Uses FlexSearch 0.8.x Document index with two fields:
 *   - "title": forward tokenizer, scored 1.0
 *   - "url":   forward tokenizer, scored 0.5
 *
 * The index is held in-memory only; it is rebuilt from IndexedDB after each
 * sync. There is no persistence here — re-indexing is cheap (< 10ms for
 * 10,000 bookmarks).
 *
 * SECURITY: No data escapes this module. All inputs are bookmark text that
 * has already passed Zod validation in validateRawBookmark.
 */

import { Document } from "flexsearch";
import type { BookmarkNode, SearchResult } from "../bookmarks/types";

// ---------------------------------------------------------------------------
// Internal document shape
// ---------------------------------------------------------------------------

/** Internal document shape used for FlexSearch indexing. */
interface BookmarkDoc {
  id: string;
  title: string;
  url: string;
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

let _idx: Document<BookmarkDoc> | null = null;
let _nodeMap = new Map<string, BookmarkNode>();

function createIndex(): Document<BookmarkDoc> {
  return new Document<BookmarkDoc>({
    tokenize: "forward",
    document: {
      id: "id",
      index: [
        { field: "title", tokenize: "forward" },
        { field: "url", tokenize: "forward" },
      ],
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rebuild the search index from a fresh set of BookmarkNodes.
 *
 * Call this after every sync. Replaces the previous index completely.
 * Folder nodes (url === undefined) are indexed with an empty URL string
 * so they can still match on title.
 */
export function buildIndex(nodes: BookmarkNode[]): void {
  _idx = createIndex();
  _nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    _idx.add({
      id: node.id,
      title: node.title,
      url: node.url ?? "",
    });
  }
}

/**
 * Query the index and return matching bookmarks as SearchResult[].
 *
 * Results from "title" field matches are scored 1.0.
 * Results from "url"-only matches are scored 0.5.
 * Deduplication ensures each bookmark appears at most once.
 *
 * Returns [] if the index has not been built yet or query is blank.
 */
export function searchBookmarks(query: string, limit = 20): SearchResult[] {
  if (_idx === null || query.trim() === "") return [];

  // fieldResults: [{ field: "title", result: Id[] }, { field: "url", result: Id[] }]
  const fieldResults = _idx.search(query, { limit });

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const { field, result } of fieldResults) {
    const score = field === "url" ? 0.5 : 1.0;
    for (const rawId of result) {
      const id = String(rawId);
      if (seen.has(id)) continue;
      const node = _nodeMap.get(id);
      if (node !== undefined) {
        seen.add(id);
        results.push({ bookmark: node, score });
      }
    }
  }

  // Title matches come first (score 1.0) so we don't need to re-sort.
  // Slice to limit in case both fields contributed results.
  return results.slice(0, limit);
}

/**
 * Reset the index to an empty state.
 * Used in tests for isolation; also called implicitly when buildIndex replaces
 * the singleton.
 */
export function resetIndex(): void {
  _idx = null;
  _nodeMap = new Map();
}

// ---------------------------------------------------------------------------
// Incremental update helpers (Task 2.2)
// ---------------------------------------------------------------------------

/**
 * Add a single bookmark to the existing index (no full rebuild).
 * No-op if the index has not been built yet (next buildIndex will include it).
 */
export function addToIndex(node: BookmarkNode): void {
  if (_idx === null) return;
  _idx.add({ id: node.id, title: node.title, url: node.url ?? "" });
  _nodeMap.set(node.id, node);
}

/**
 * Update a single bookmark in the existing index.
 * No-op if the index has not been built yet.
 */
export function updateInIndex(node: BookmarkNode): void {
  if (_idx === null) return;
  _idx.update(node.id, { id: node.id, title: node.title, url: node.url ?? "" });
  _nodeMap.set(node.id, node);
}

/**
 * Remove a single bookmark from the index by id.
 * No-op if the index has not been built yet.
 */
export function removeFromIndex(id: string): void {
  if (_idx === null) return;
  _idx.remove(id);
  _nodeMap.delete(id);
}
