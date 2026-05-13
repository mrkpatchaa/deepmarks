/**
 * Side panel root — Task 3.1
 *
 * Loads bookmarks directly from IndexedDB via cursor-based pagination
 * (page size 200). No GET_ALL message to the background worker.
 *
 * SECURITY:
 *   - No remote resources of any kind are requested.
 *   - URL scheme guard is enforced inside BookmarkCard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBookmarkPage } from "../../lib/storage/db";
import { BookmarkList } from "../../components/BookmarkList";
import type { BookmarkNode } from "../../lib/bookmarks/types";

const PAGE_SIZE = 200;

/** Mutable ref bag — avoids stale closure issues without extra re-renders. */
interface LoadState {
  lastKey: string | undefined;
  hasMore: boolean;
  active: boolean; // true while a page fetch is in-flight
}

export default function App() {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
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
            setBookmarks((prev) => [...prev, ...page]);
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
      <main className="flex-1 overflow-hidden">
        <BookmarkList bookmarks={bookmarks} onScrollNearEnd={loadPage} />
      </main>
    </div>
  );
}
