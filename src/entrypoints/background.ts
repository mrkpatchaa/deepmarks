/**
 * Background service worker — Task 1.4
 *
 * Responsibilities:
 *   1. On install / startup: run a full sync (chrome.bookmarks → IndexedDB)
 *   2. After startup sync: attach the live bookmark watcher (debounced 500ms)
 *
 * SECURITY:
 *   - Logs only counts, never titles, URLs, or any bookmark content.
 *   - All data sanitisation happens inside syncAllBookmarks / validateRawBookmark.
 */
import { syncAllBookmarks, startWatcher } from "../lib/bookmarks/sync";

async function initialSync(): Promise<void> {
  const result = await syncAllBookmarks();
  if (result.ok) {
    console.log(`[deepmarks] synced ${String(result.value.count)} bookmarks`);
  } else {
    console.error(`[deepmarks] sync failed: ${result.error}`);
  }
  startWatcher();
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void initialSync();
  });

  chrome.runtime.onStartup.addListener(() => {
    void initialSync();
  });
});
