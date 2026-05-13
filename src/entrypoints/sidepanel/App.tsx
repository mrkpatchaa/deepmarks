/**
 * Side panel root — Task 3.1 + Task 3.2
 *
 * Loads bookmarks directly from IndexedDB via cursor-based pagination
 * (page size 200). No GET_ALL message to the background worker.
 *
 * Search (Task 3.2): typing in SearchBar sends a SEARCH message to the
 * background, which uses the in-memory FlexSearch index and responds
 * synchronously with ranked results.
 *
 * SECURITY:
 *   - No remote resources of any kind are requested.
 *   - URL scheme guard is enforced inside BookmarkCard.
 *   - Search query is Zod-validated in the background message handler.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBookmarkPage } from "../../lib/storage/db";
import { BookmarkList } from "../../components/BookmarkList";
import { SearchBar } from "../../components/SearchBar";
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
  const [resultCount, setResultCount] = useState<number | undefined>(undefined);
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
      setResultCount(undefined);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "SEARCH", query, limit: 50 },
      (results: SearchResult[]) => {
        const nodes = results.map((r) => r.bookmark);
        setSearchResults(nodes);
        setResultCount(nodes.length);
      },
    );
  }, []);

  const displayedBookmarks = searchResults ?? allBookmarks;

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
      <main className="flex-1 overflow-hidden">
        <BookmarkList
          bookmarks={displayedBookmarks}
          onScrollNearEnd={searchResults === null ? loadPage : undefined}
        />
      </main>
    </div>
  );
}
