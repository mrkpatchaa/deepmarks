/**
 * Vitest global setup — mocks Chrome Extension APIs.
 *
 * Each test file receives a fresh set of vi.fn() mocks because
 * vi.stubGlobal is called at module scope and vitest restores
 * stubs between test files when restoreMocks / unstubAllGlobals is set.
 *
 * NOTE: Tests that need custom chrome mock behaviour should use
 *   (chrome.bookmarks.getTree as ReturnType<typeof vi.fn>).mockResolvedValue(...)
 */
import { vi } from "vitest";

// Set up the full suite of fake-indexeddb globals (IDBFactory, IDBRequest,
// IDBKeyRange, IDBDatabase, IDBObjectStore, …) so that the `idb` library can
// reference these constructors in instanceof checks.
// We do this ONCE at setup time.  Individual tests reset globalThis.indexedDB
// to a fresh IDBFactory for isolation (see tests/unit/storage.test.ts).
import "fake-indexeddb/auto";

const bookmarksEventMock = () => ({
  addListener: vi.fn(),
  removeListener: vi.fn(),
  hasListener: vi.fn().mockReturnValue(false),
});

const chromeMock = {
  bookmarks: {
    getTree: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    onCreated: bookmarksEventMock(),
    onChanged: bookmarksEventMock(),
    onRemoved: bookmarksEventMock(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    connect: vi.fn().mockReturnValue({
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    }),
    connectNative: vi.fn(),
    onConnect: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
    id: "deepmarks-test-extension-id",
  },
  sidePanel: {
    open: vi.fn(),
    setOptions: vi.fn(),
    setPanelBehavior: vi.fn(),
  },
};

vi.stubGlobal("chrome", chromeMock);
