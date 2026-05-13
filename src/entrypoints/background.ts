/**
 * Background service worker — Task 1.4 + Task 2.2 + Task 7.1
 *
 * Responsibilities:
 *   1. On install / startup: run a full sync (chrome.bookmarks → IndexedDB)
 *      then rebuild the in-memory FlexSearch index.
 *   2. After startup sync: attach the live bookmark watcher (debounced 500ms).
 *   3. Incremental index updates on onCreated / onChanged / onRemoved.
 *   4. SEARCH message handler: validate input with Zod, run searchBookmarks,
 *      respond synchronously.
 *   5. NATIVE_MSG message handler: relay to daemon via Native Messaging;
 *      daemon responses are forwarded to callers (Task 7.1).
 *   6. DAEMON_STATUS message handler: returns isDaemonInstalled() for the
 *      side panel banner.
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
import {
    sendToDaemon,
    setDaemonListener,
    isDaemonInstalled,
    disconnectDaemon,
} from "../lib/agent/native-messaging";

// ---------------------------------------------------------------------------
// Message protocol schema (Task 2.2)
// ---------------------------------------------------------------------------

const SearchMessageSchema = z.object({
    type: z.literal("SEARCH"),
    query: z.string().max(200),
    limit: z.number().int().min(1).max(100).optional(),
});

/** Relay a message to the daemon and forward the response back to the caller. */
const NativeMsgSchema = z.object({
    type: z.literal("NATIVE_MSG"),
    id: z.number().int().nonnegative(),
    nativeType: z.string(),
    payload: z.record(z.string(), z.unknown()),
});

const DaemonStatusSchema = z.object({
    type: z.literal("DAEMON_STATUS"),
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
    // Map from request id → sendResponse callback for in-flight NATIVE_MSG requests.
    const pending = new Map<number, (value: unknown) => void>();

    // Register daemon inbound listener once — forwards responses to pending callers.
    setDaemonListener((msg) => {
        const resolve = pending.get(msg.id);
        if (resolve !== undefined) {
            pending.delete(msg.id);
            resolve(msg.payload);
        }
    });

    chrome.runtime.onMessage.addListener(
        (message, _sender, sendResponse) => {
            // ── SEARCH ──────────────────────────────────────────────────────────
            const search = SearchMessageSchema.safeParse(message);
            if (search.success) {
                const { query, limit } = search.data;
                sendResponse(searchBookmarks(query, limit));
                return false;
            }

            // ── DAEMON_STATUS ────────────────────────────────────────────────────
            const status = DaemonStatusSchema.safeParse(message);
            if (status.success) {
                sendResponse({ installed: isDaemonInstalled() });
                return false;
            }

            // ── NATIVE_MSG ───────────────────────────────────────────────────────
            const native = NativeMsgSchema.safeParse(message);
            if (native.success) {
                const { id, nativeType, payload } = native.data;
                pending.set(id, sendResponse);
                const sent = sendToDaemon({ id, type: nativeType, payload });
                if (!sent) {
                    pending.delete(id);
                    sendResponse({ error: "daemon_unavailable" });
                    return false;
                }
                // Keep channel open for async response.
                return true;
            }

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

    // Tear down the native messaging port when the service worker is about to
    // be killed so Chrome does not log a stale port warning.
    if (typeof self !== "undefined" && "addEventListener" in self) {
        (self as unknown as { addEventListener: (evt: string, cb: () => void) => void }).addEventListener("beforeunload", () => {
            disconnectDaemon();
        });
    }

    registerIndexWatcher();
    registerMessageHandler();
});
