/**
 * Background service worker — Task 1.4 + Task 2.2
 *
 * Responsibilities:
 *   1. On install / startup: run a full sync (chrome.bookmarks → IndexedDB)
 *      then rebuild the in-memory FlexSearch index.
 *   2. After startup sync: attach the live bookmark watcher (debounced 500ms).
 *   3. Incremental index updates on onCreated / onChanged / onRemoved.
 *   4. SEARCH message handler: validate input with Zod, run searchBookmarks,
 *      respond synchronously.
 *
 * SECURITY:
 *   - Logs only counts, never titles, URLs, or any bookmark content.
 *   - All data sanitisation happens inside syncAllBookmarks / validateRawBookmark.
 *   - Incoming messages are Zod-validated before use.
 *   - query is capped to 200 chars; limit is capped to 100 per the schema.
 */
import { z } from "zod";
import {
  syncAllBookmarks,
  startWatcher,
  validateRawBookmark,
  getAllBookmarksFromDb,
} from "../lib/bookmarks/sync";
import {
  buildIndex,
  addToIndex,
  updateInIndex,
  removeFromIndex,
  searchBookmarks,
} from "../lib/search/index";

// ---------------------------------------------------------------------------
// Message protocol schema (Task 2.2)
// ---------------------------------------------------------------------------

const SearchMessageSchema = z.object({
  type: z.literal("SEARCH"),
  query: z.string().max(200),
  limit: z.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Initial sync + index build
// ---------------------------------------------------------------------------

async function initialSync(): Promise<void> {
  const result = await syncAllBookmarks();
  if (result.ok) {
    console.log(`[deepmarks] synced ${String(result.value.count)} bookmarks`);
  } else {
    console.error(`[deepmarks] sync failed: ${result.error}`);
    return;
  }

  // Build the search index from freshly synced data.
  const all = await getAllBookmarksFromDb();
  if (all.ok) {
    buildIndex(all.value);
    console.log(`[deepmarks] indexed ${String(all.value.length)} bookmarks`);
  }

  startWatcher();
}

// ---------------------------------------------------------------------------
// Incremental index updates (no full rebuild per event)
// ---------------------------------------------------------------------------

function registerIndexWatcher(): void {
  // onCreated supplies the full BookmarkTreeNode — validate and add immediately.
  chrome.bookmarks.onCreated.addListener((_id, treeNode) => {
    addToIndex(validateRawBookmark(treeNode));
  });

  // onChanged only supplies partial data; fetch the current full node first.
  chrome.bookmarks.onChanged.addListener((id, _changeInfo) => {
    void chrome.bookmarks.get(id).then((results) => {
      const treeNode = results[0];
      if (treeNode !== undefined) {
        updateInIndex(validateRawBookmark(treeNode));
      }
    });
  });

  // onRemoved — id is sufficient to remove from the index.
  chrome.bookmarks.onRemoved.addListener((id) => {
    removeFromIndex(id);
  });
}

// ---------------------------------------------------------------------------
// SEARCH message handler
// ---------------------------------------------------------------------------

function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      const parsed = SearchMessageSchema.safeParse(message);
      if (!parsed.success) return false;
      const { query, limit } = parsed.data;
      // searchBookmarks is synchronous — respond before returning.
      sendResponse(searchBookmarks(query, limit));
      return false;
    },
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void initialSync();
  });

  chrome.runtime.onStartup.addListener(() => {
    void initialSync();
  });

  registerIndexWatcher();
  registerMessageHandler();
});
