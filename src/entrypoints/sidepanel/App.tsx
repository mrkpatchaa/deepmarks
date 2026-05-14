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
import { useCallback, useEffect, useRef, useState } from "react";
import { getBookmarkPage, getAllBookmarks, getBookmarkCounts, getBookmarksByCategory } from "../../lib/storage/db";
import { StatsView } from "../../components/StatsView";
import { SettingsView } from "../../components/SettingsView";
import { BookmarkList } from "../../components/BookmarkList";
import { SearchBar } from "../../components/SearchBar";
import { CategoryFilter } from "../../components/CategoryFilter";
import { WikiView } from "../../components/WikiView";
import { EngineSelector } from "../../components/Settings/EngineSelector";
import { ClassifyPanel } from "../../components/ClassifyPanel";
import type { ClassifyResult } from "../../components/ClassifyPanel";
import { compileWiki } from "../../lib/wiki/compile";
import { saveWikiFile } from "../../lib/wiki/export";
import { exportJSON } from "../../lib/agent/export";
import { classifyAll } from "../../lib/classify/batch";
import type { ClassifyAllProgress } from "../../lib/classify/batch";
import { getBestAvailableEngine } from "../../lib/classify/router";
import { savePreferredEngine, loadPreferredEngine } from "../../lib/storage/settings";
import type { FilterCategory, CategoryCounts } from "../../components/CategoryFilter";
import type { BookmarkNode, SearchResult, BookmarkMeta, ClassifyEngine } from "../../lib/bookmarks/types";

const PAGE_SIZE = 200;

const DEFAULT_COUNTS: CategoryCounts = { all: 0 };

type TabId = "bookmarks" | "wiki" | "stats" | "settings";

/** Mutable ref bag — avoids stale closure issues without extra re-renders. */
interface LoadState {
  lastKey: string | undefined;
  hasMore: boolean;
  active: boolean; // true while a page fetch is in-flight
}

/** True when the app is running as a full tab (opened via Open in tab). */
const IS_TAB = new URL(location.href).searchParams.get("tab") === "1";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("bookmarks");
  const [allBookmarks, setAllBookmarks] = useState<BookmarkNode[]>([]);
  const [searchResults, setSearchResults] = useState<BookmarkNode[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const [wikiMarkdown, setWikiMarkdown] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [daemonReady, setDaemonReady] = useState<boolean | null>(null);
  const [selectedBookmark, setSelectedBookmark] = useState<BookmarkNode | null>(null);
  const [classifyAllState, setClassifyAllState] = useState<ClassifyAllProgress & { running: boolean } | null>(null);
  const classifyAllAbort = useRef<AbortController | null>(null);
  const [preferredEngine, setPreferredEngine] = useState<ClassifyEngine>("regex");
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>(DEFAULT_COUNTS);
  const [categoryBookmarks, setCategoryBookmarks] = useState<BookmarkNode[] | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const loadState = useRef<LoadState>({
    lastKey: undefined,
    hasMore: true,
    active: false,
  });

  const loadCounts = useCallback((): void => {
    void (async () => {
      const result = await getBookmarkCounts();
      if (result.ok) {
        setCategoryCounts(result.value);
      }
    })();
  }, []);

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

  // Load first page + accurate counts on mount; also restore the saved engine.
  useEffect(() => {
    loadPage();
    loadCounts();
    void (async () => {
      const saved = await loadPreferredEngine();
      setPreferredEngine(saved ?? await getBestAvailableEngine());
    })();
    setInitialLoading(false);
  }, [loadPage, loadCounts]);

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
  // When a specific category is selected, fetch its full list from IDB so the
  // displayed count matches the pill count (the paginated allBookmarks list may
  // not contain every bookmark of that category).
  const handleCategorySelect = useCallback((cat: FilterCategory): void => {
    setSelectedCategory((prev) => {
      const next = prev === cat ? "all" : cat;
      if (next === "all") {
        setCategoryBookmarks(null);
        setCategoryLoading(false);
      } else {
        setCategoryLoading(true);
        void getBookmarksByCategory(next).then((result) => {
          if (result.ok) setCategoryBookmarks(result.value);
          setCategoryLoading(false);
        });
      }
      return next;
    });
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

  // Classify All — batch-classify every unclassified bookmark.
  const handleClassifyAll = useCallback((force = false): void => {
    if (classifyAllState?.running) return;
    const abort = new AbortController();
    classifyAllAbort.current = abort;
    setClassifyAllState({ running: true, done: 0, total: 0, failed: 0, recentlyClassified: [] });
    void (async () => {
      // Load the full bookmark set from IDB (may be larger than what's paged in).
      const result = await getAllBookmarks();
      if (!result.ok || abort.signal.aborted) {
        setClassifyAllState(null);
        return;
      }
      try {
        await classifyAll(
          result.value,
          preferredEngine,
          (progress) => {
            setClassifyAllState({ running: true, ...progress });
            // Update individual bookmark cards on the fly — category badges appear
            // immediately as each item is classified rather than only at the end.
            if (progress.recentlyClassified.length > 0) {
              setAllBookmarks((prev) => {
                const byId = new Map(prev.map((bm) => [bm.id, bm]));
                for (const { id, output } of progress.recentlyClassified) {
                  const bm = byId.get(id);
                  if (bm !== undefined) {
                    byId.set(id, {
                      ...bm,
                      meta: {
                        tags: bm.meta?.tags ?? [],
                        classifiedAt: Date.now(),
                        classifiedBy: output.usedEngine,
                        category: output.category,
                        domain: output.domain,
                      },
                    });
                  }
                }
                return prev.map((bm) => byId.get(bm.id) ?? bm);
              });
            }
          },
          abort.signal,
          force,
        );
      } finally {
        // Always reload from IDB after completion, cancellation, or unexpected error
        // so the UI stays in sync and setClassifyAllState(null) is always called.
        const [refreshed, counts] = await Promise.all([getAllBookmarks(), getBookmarkCounts()]);
        if (refreshed.ok) {
          setAllBookmarks(refreshed.value);
        }
        if (counts.ok) {
          setCategoryCounts(counts.value);
        }
        // If a category filter is active, refresh its list from IDB.
        if (selectedCategory !== "all") {
          void getBookmarksByCategory(selectedCategory).then((r) => {
            if (r.ok) setCategoryBookmarks(r.value);
          });
        }
        setClassifyAllState(null);
        classifyAllAbort.current = null;
      }
    })();
  }, [classifyAllState, preferredEngine, selectedCategory]);

  const handleCancelClassifyAll = useCallback((): void => {
    classifyAllAbort.current?.abort();
  }, []);

  const handleEngineChange = useCallback((engine: ClassifyEngine): void => {
    setPreferredEngine(engine);
    void savePreferredEngine(engine);
  }, []);

  // After classification, update the bookmark's meta in local state so the  // category badge appears immediately without a full reload.
  const handleClassified = useCallback((result: ClassifyResult): void => {
    if (selectedBookmark === null) return;
    const updatedMeta: BookmarkMeta = {
      category: result.category,
      tags: selectedBookmark.meta?.tags ?? [],
      classifiedAt: Date.now(),
      classifiedBy: result.usedEngine,
    };
    const updated: BookmarkNode = { ...selectedBookmark, meta: updatedMeta };
    setSelectedBookmark(updated);
    setAllBookmarks((prev) =>
      prev.map((bm) => (bm.id === updated.id ? updated : bm)),
    );
    // Delta-update pill counts — no IDB round-trip needed.
    const oldCat: FilterCategory = selectedBookmark.meta?.category ?? "other";
    const newCat: FilterCategory = result.category;
    if (oldCat !== newCat) {
      setCategoryCounts((prev) => ({
        ...prev,
        [oldCat]: Math.max(0, prev[oldCat] - 1),
        [newCat]: prev[newCat] + 1,
      }));
      // Keep the category-filtered list in sync:
      // remove the bookmark if it no longer belongs to the active category,
      // or add it if it now belongs.
      if (selectedCategory !== "all") {
        setCategoryBookmarks((prev) => {
          if (prev === null) return null;
          if (String(oldCat) === selectedCategory) {
            return prev.filter((bm) => bm.id !== updated.id);
          }
          if (String(newCat) === selectedCategory) {
            return [...prev, updated];
          }
          return prev;
        });
      }
    } else if (selectedCategory !== "all") {
      // Category unchanged but meta may have updated — keep the item current.
      setCategoryBookmarks((prev) =>
        prev === null ? null : prev.map((bm) => (bm.id === updated.id ? updated : bm)),
      );
    }
  }, [selectedBookmark, selectedCategory]);

  // When searching: always filter search results by category (they're a small pre-fetched set).
  // When not searching + "all": use the paginated allBookmarks list.
  // When not searching + specific category: use the IDB-fetched categoryBookmarks list so the
  // displayed count is always consistent with the pill count.
  const displayedBookmarks =
    searchResults !== null
      ? (selectedCategory === "all"
          ? searchResults
          : searchResults.filter((bm) => (bm.meta?.category ?? "other") === selectedCategory))
      : (selectedCategory === "all"
          ? allBookmarks
          : (categoryBookmarks ?? []));

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
          <div className="flex items-center gap-2">
            {classifyAllState === null ? (
              IS_TAB ? (
                // Full: text buttons
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { handleClassifyAll(false); }}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Classify new
                  </button>
                  <span className="text-xs text-zinc-300 dark:text-zinc-600" aria-hidden="true">|</span>
                  <button
                    type="button"
                    onClick={() => { handleClassifyAll(true); }}
                    className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  >
                    Re-classify all
                  </button>
                  <EngineSelector value={preferredEngine} onChange={handleEngineChange} />
                </div>
              ) : (
                // Lite: icon-only buttons
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Classify new"
                    aria-label="Classify new"
                    onClick={() => { handleClassifyAll(false); }}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    {/* sparkle / classify-new icon */}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Re-classify all"
                    aria-label="Re-classify all"
                    onClick={() => { handleClassifyAll(true); }}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    {/* rotate / re-classify icon */}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                  </button>
                  <EngineSelector value={preferredEngine} onChange={handleEngineChange} />
                </div>
              )
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {classifyAllState.done} / {classifyAllState.total === 0 ? "…" : String(classifyAllState.total)}
                  {classifyAllState.failed > 0 && (
                    <span className="ml-1 text-red-500">
                      ({classifyAllState.failed} failed)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleCancelClassifyAll}
                  className="text-xs text-red-500 underline hover:text-red-700"
                >
                  Cancel
                </button>
              </div>
            )}
            {/* Export — full tab only */}
            {IS_TAB && (
              <button
                type="button"
                onClick={handleExport}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Export
              </button>
            )}
            {/* Open-in-tab — sidepanel only */}
            {!IS_TAB && (
              <button
                type="button"
                aria-label="Open in tab"
                title="Open in tab"
                onClick={() => {
                  void chrome.tabs.create({ url: `${chrome.runtime.getURL("sidepanel.html")}?tab=1` });
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
            )}
            <button
              type="button"
              aria-label="Settings"
              onClick={() => { handleTabChange("settings"); }}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
              </svg>
            </button>
          </div>
        </div>
        {/* Progress bar — visible during Classify All */}
        {classifyAllState !== null && classifyAllState.total > 0 && (
          <div className="mt-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                role="progressbar"
                aria-valuenow={classifyAllState.done}
                aria-valuemin={0}
                aria-valuemax={classifyAllState.total}
                className="h-full rounded-full bg-blue-500 transition-all duration-150"
                style={{ width: `${Math.round((classifyAllState.done / classifyAllState.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
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
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "stats"}
          onClick={() => { handleTabChange("stats"); }}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "stats" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
        >
          Stats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "settings"}
          onClick={() => { handleTabChange("settings"); }}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "settings" ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
        >
          Settings
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
              onClassify={setSelectedBookmark}
            />
          </main>
        </>
      )}

      {activeTab === "wiki" && (
        <main className="flex-1 overflow-y-auto px-4 py-4">
          {wikiMarkdown !== null && <WikiView markdown={wikiMarkdown} />}
        </main>
      )}

      {activeTab === "stats" && (
        <main className="flex-1 overflow-hidden">
          <StatsView />
        </main>
      )}

      {activeTab === "settings" && (
        <main className="flex flex-col flex-1 overflow-hidden">
          <SettingsView />
        </main>
      )}

      {/* Classify bottom sheet — appears when user clicks "Classify" on a card */}
      {selectedBookmark !== null && (
        <div
          role="dialog"
          aria-label={`Classify: ${selectedBookmark.title}`}
          className="border-t border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between px-4 py-2">
            <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {selectedBookmark.title}
            </p>
            <button
              type="button"
              aria-label="Close classify panel"
              onClick={() => { setSelectedBookmark(null); }}
              className="ml-2 shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </div>
          <ClassifyPanel
            bookmark={selectedBookmark}
            preferredEngine={preferredEngine}
            onClassified={handleClassified}
          />
        </div>
      )}
    </div>
  );
}
