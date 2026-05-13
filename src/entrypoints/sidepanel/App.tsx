/**
 * Side panel root — Task 3.1 + Task 3.2 + Task 3.3 + Task 6.2 + Task 7.1
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
 * Wiki tab (Task 6.2): compiles all classified bookmarks into a markdown
 * wiki rendered via react-markdown + rehype-sanitize.
 *
 * Daemon banner (Task 7.1): polls DAEMON_STATUS on mount; shows a banner
 * if the native host is not installed.
 *
 * SECURITY:
 *   - No remote resources of any kind are requested.
 *   - URL scheme guard is enforced inside BookmarkCard.
 *   - Search query is Zod-validated in the background message handler.
 *   - Wiki markdown rendered with skipHtml + rehype-sanitize.
 *   - Export requires explicit user gesture (button click), uses File System Access API.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBookmarkPage, getAllBookmarks } from "../../lib/storage/db";
import { BookmarkList } from "../../components/BookmarkList";
import { SearchBar } from "../../components/SearchBar";
import { CategoryFilter } from "../../components/CategoryFilter";
import { WikiView } from "../../components/WikiView";
import { compileWiki } from "../../lib/wiki/compile";
import { saveWikiFile } from "../../lib/wiki/export";
import { exportJSON } from "../../lib/agent/export";
import type { FilterCategory, CategoryCounts } from "../../components/CategoryFilter";
import type { BookmarkNode, SearchResult } from "../../lib/bookmarks/types";

const PAGE_SIZE = 200;

type TabId = "bookmarks" | "wiki";

/** Mutable ref bag — avoids stale closure issues without extra re-renders. */
interface LoadState {
  lastKey: string | undefined;
  hasMore: boolean;
  active: boolean; // true while a page fetch is in-flight
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("bookmarks");
  const [allBookmarks, setAllBookmarks] = useState<BookmarkNode[]>([]);
  const [searchResults, setSearchResults] = useState<BookmarkNode[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const [wikiMarkdown, setWikiMarkdown] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [daemonReady, setDaemonReady] = useState<boolean | null>(null);
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

  // Check daemon status on mount (lazy — doesn't connect; background just reads flag).
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "DAEMON_STATUS" },
      (response: { installed: boolean } | undefined) => {
        if (response !== undefined) {
          setDaemonReady(response.installed);
        }
      },
    );
  }, []);

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

  // Compile wiki when switching to wiki tab.
  const handleTabChange = useCallback((tab: TabId): void => {
    setActiveTab(tab);
    if (tab === "wiki") {
      setWikiMarkdown(compileWiki(allBookmarks));
    }
  }, [allBookmarks]);

  // Export for agents — requires user gesture, uses File System Access API.
  const handleExport = useCallback((): void => {
    setExportError(null);
    void (async () => {
      try {
        const result = await getAllBookmarks();
        if (!result.ok) {
          setExportError("Failed to load bookmarks for export.");
          return;
        }
        const bookmarks = result.value;
        // File System Access API — not in lib.dom.d.ts, cast via unknown to avoid TS error
        const dirPicker = (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
        const dirHandle = await dirPicker({ mode: "readwrite" });
        // Write wiki markdown
        await saveWikiFile(bookmarks, dirHandle);
        // Write JSON
        const jsonStr = await exportJSON();
        const jsonHandle = await dirHandle.getFileHandle("bookmarks-export.json", { create: true });
        const writable = await jsonHandle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
        setExportError("Export failed. Please try again.");
      }
    })();
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
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Deepmarks
          </h1>
          <button
            type="button"
            onClick={handleExport}
            className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Export for Agents
          </button>
        </div>
        {exportError !== null && (
          <p className="mt-1 text-xs text-red-500" role="alert">{exportError}</p>
        )}
      </header>

      {/* Daemon not installed banner */}
      {daemonReady === false && (
        <div
          role="alert"
          className="bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        >
          Install daemon to enable agent integration.{" "}
          <a
            href="https://github.com/deepmarks/deepmarks#daemon"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Learn more
          </a>
        </div>
      )}

      {/* Tab row */}
      <nav className="flex border-b border-zinc-200 dark:border-zinc-700" aria-label="View tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "bookmarks"}
          onClick={() => { handleTabChange("bookmarks"); }}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "bookmarks" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
        >
          Bookmarks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "wiki"}
          onClick={() => { handleTabChange("wiki"); }}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "wiki" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
        >
          Wiki
        </button>
      </nav>

      {activeTab === "bookmarks" && (
        <>
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
        </>
      )}

      {activeTab === "wiki" && (
        <main className="flex-1 overflow-y-auto px-4 py-4">
          {wikiMarkdown !== null && <WikiView markdown={wikiMarkdown} />}
        </main>
      )}
    </div>
  );
}
