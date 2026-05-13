/**
 * Side panel root — Task 3.1 + Task 3.2 + Task 3.3
 *
 * Loads bookmarks directly from IndexedDB via cursor-based pagination
 * (page size 200). No GET_ALL message to the background worker.
 *
 * Search (Task 3.2): typing in SearchBar sends a SEARCH message to the
 * background, which uses the in-memory FlexSearch index and responds
 * synchronously with ranked results.
 *
 * CategoryFilter (Task 3.3): horizontal pill row filters the displayed
 * list by category. Combined filter + search both apply simultaneously.
 * Category counts are derived from allBookmarks (full IDB set).
 *
 * SECURITY:
 *   - No remote resources of any kind are requested.
 *   - URL scheme guard is enforced inside BookmarkCard.
 *   - Search query is Zod-validated in the background message handler.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBookmarkPage } from "../../lib/storage/db";
import { BookmarkList } from "../../components/BookmarkList";
import { SearchBar } from "../../components/SearchBar";
import { CategoryFilter } from "../../components/CategoryFilter";
import type { FilterCategory, CategoryCounts } from "../../components/CategoryFilter";
import type { BookmarkNode, SearchResult } from "../../lib/bookmarks/types";

const PAGE_SIZE = 200;

/** Mutable ref bag — avoids stale closure issues without extra re-renders. */
interface LoadState {
  lastKey: string | undefined;
  hasMore: boolean;
  active: boolean; // true while a page fetch is in-flight
}

export default function App() {
  const [allBookmarks, setAllBookmarks] = useState<BookmarkNode[]>([]);
  const [searchResults, setSearchResults] = useState<BookmarkNode[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const loadState = useRef<LoadState>({
    lastKey: undefined,
    hasMore: true,
    active: false,
  });

  const loadPage = useCallback((): void => {
    const state = loadState.current;
    if (state.active || !state.hasMore) return;
    state.active = true;

    void (async () => {
      try {
        const result = await getBookmarkPage(state.lastKey, PAGE_SIZE);
        if (result.ok) {
          const page = result.value;
          const lastItem = page[page.length - 1];
          state.lastKey = lastItem?.id;
          state.hasMore = page.length >= PAGE_SIZE;
          if (page.length > 0) {
            setAllBookmarks((prev) => [...prev, ...page]);
          }
        }
      } finally {
        state.active = false;
      }
    })();
  }, []);

  // Load first page on mount.
  useEffect(() => {
    loadPage();
    setInitialLoading(false);
  }, [loadPage]);

  // Handle search query — send SEARCH message to background, show results.
  const handleSearch = useCallback((query: string): void => {
    if (query === "") {
      setSearchResults(null);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "SEARCH", query, limit: 50 },
      (results: SearchResult[]) => {
        setSearchResults(results.map((r) => r.bookmark));
      },
    );
  }, []);

  // Handle category pill click — toggle to "all" if clicking the active pill.
  const handleCategorySelect = useCallback((cat: FilterCategory): void => {
    setSelectedCategory((prev) => (prev === cat ? "all" : cat));
  }, []);

  // Category counts derived from the full allBookmarks list (not filtered).
  const categoryCounts: CategoryCounts = useMemo(() => {
    const counts: CategoryCounts = {
      all: allBookmarks.length,
      tool: 0,
      security: 0,
      technique: 0,
      launch: 0,
      research: 0,
      opinion: 0,
      commerce: 0,
      other: 0,
    };
    for (const bm of allBookmarks) {
      const cat = bm.meta?.category ?? "other";
      counts[cat] = counts[cat] + 1;
    }
    return counts;
  }, [allBookmarks]);

  // Base list: search results when searching, full allBookmarks otherwise.
  const baseList = searchResults ?? allBookmarks;

  // Apply category filter on top of base list.
  const displayedBookmarks =
    selectedCategory === "all"
      ? baseList
      : baseList.filter((bm) => (bm.meta?.category ?? "other") === selectedCategory);

  // Result count for SearchBar — only show when a search is active.
  const resultCount = searchResults !== null ? displayedBookmarks.length : undefined;

  if (initialLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Deepmarks
        </h1>
      </header>
      <SearchBar onSearch={handleSearch} resultCount={resultCount} />
      <CategoryFilter
        counts={categoryCounts}
        selected={selectedCategory}
        onSelect={handleCategorySelect}
      />
      <main className="flex-1 overflow-hidden">
        <BookmarkList
          bookmarks={displayedBookmarks}
          onScrollNearEnd={searchResults === null ? loadPage : undefined}
        />
      </main>
    </div>
  );
}
