# Implementation Plan: Deepmarks

> **Read-only planning document. No code is written here.**  
> Last updated: May 13, 2026

---

## Overview

Deepmarks is a local-first browser extension (Chrome MV3 + Firefox MV3 via WXT) that indexes native bookmarks, classifies them via a built-in regex engine or a user-supplied LLM key, and exposes them to AI coding agents through a companion MCP daemon — all without sending data anywhere by default.

The plan is vertically sliced: each phase delivers working, testable, end-to-end functionality. No phase leaves the system in a broken state.

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| **WXT as extension framework** | MV3-native, HMR, multi-target (Chrome/Firefox), TypeScript-first, avoids hand-rolling manifest merging |
| **FlexSearch over Fuse.js or MiniSearch** | ~200ms at 10k docs in a service worker, no WASM, smallest bundle among options that meet the perf bar |
| **idb over raw IndexedDB** | Type-safe, promise-based wrapper; no runtime overhead; widely used |
| **Regex classifier is default (no network)** | Extension must be fully functional on first install with no configuration; meets the "zero outbound" bar |
| **BYOK only (no proxy server)** | Eliminates the need for any cloud infrastructure; key is stored in `chrome.storage.local` exclusively |
| **Native Messaging for daemon** | MV3 service workers cannot bind TCP ports; Native Messaging is the only supported MV3 bridge to a local process |
| **Zod for runtime validation** | All data crossing trust boundaries (chrome.bookmarks API, Native Messaging protocol, BYOK API responses) is validated with Zod schemas before use |
| **Daemon binds to 127.0.0.1 only** | Prevents LAN/external network access to the MCP server; shared secret added at install time for auth |
| **No content scripts in v1** | chrome.bookmarks API gives us the full tree from background context; no need to inject scripts into pages, reducing attack surface to zero |

---

## Dependency Graph

```
Phase 0: Project Scaffold
    │
    ├── Phase 1: Data Foundation
    │     ├── Types (BookmarkNode, BookmarkMeta, Category)
    │     ├── IndexedDB schema (idb)
    │     ├── chrome.bookmarks sync + watch → IndexedDB CRUD
    │     └── Background service worker (sync orchestration)
    │           │
    │           ├── Phase 2: Search
    │           │     └── FlexSearch builder + query
    │           │           │
    │           │           ├── Phase 3: Side Panel — Browse & Search
    │           │           │     SearchBar, BookmarkList, BookmarkCard
    │           │           │     (first usable UI — searchable bookmarks)
    │           │           │
    │           │           └── Phase 4: Classification Engine
    │           │                 Regex (default) + BYOK router + ClassifyPanel
    │           │                       │
    │           │                       ├── Phase 5: Settings & Options
    │           │                       │     BYOK key input, CategoryEditor, EngineStatus, Popup
    │           │                       │
    │           │                       └── Phase 6: Wiki & Agent Export
    │           │                             Wiki compile, WikiView, Export JSON/MD
    │           │
    │           └── Phase 7: Companion Daemon
    │                 Native Messaging (background side)
    │                 daemon/ Node.js MCP HTTP server
    │                 install.sh
    │
    └── Phase 8: Security Hardening & QA
          CSP audit, permissions audit, bundle size, full E2E
```

---

## Security Threat Model (read before implementation)

| Threat | Mitigations built into this plan |
|---|---|
| API key exfiltration | Keys stored ONLY in `chrome.storage.local`; never passed to content scripts; never logged; never exported |
| XSS via bookmark titles/URLs | No `innerHTML` / `dangerouslySetInnerHTML` anywhere; React JSX rendering only; **explicit `http:`/`https:` protocol allowlist** after parsing — `z.string().regex(/^https?:\/\//i)` in Zod schemas and scheme guard before rendering any anchor. `new URL("javascript:alert(1)")` parses without error; the `URL` constructor alone is **not** sufficient and must not be cited as the mitigation |
| Malicious bookmark data corrupting IndexedDB | Zod schema validation at chrome.bookmarks API boundary before any write |
| Daemon accessible from LAN or other processes | HTTP server binds `127.0.0.1` only; `Origin` header checked; shared secret validated on every request |
| Prompt injection via bookmark content | BYOK classification prompt templates are static; bookmark content is injected into a structured slot, not free-form system prompt |
| Supply chain attack | Exact version pins in `package.json`; `pnpm audit` in CI; no postinstall scripts from untrusted packages |
| MV3 CSP bypass | `content_security_policy` in manifest set to `script-src 'self'; object-src 'none'`; no `eval`, no `new Function` |
| PII leak via crash reporter | No crash reporter, no analytics, no telemetry of any kind |
| Native Messaging spoofing | Extension checks `chrome.runtime.id` on connect; daemon validates extension ID matches allowlist |

---

## Version Floors to Verify (as of May 2026)

> These are **minimum known-working versions**, not the values to write into `package.json`. At scaffold time verify each package's latest stable release on npm and pin an **exact** version (no `^` or `~`).

| Package | Version floor to verify | Notes |
|---|---|---|
| WXT | `^0.20.0` (or latest stable 1.x if released) | Check wxt.dev/releases before init |
| React | `^19.1.0` | Concurrent mode stable, no `eval`-based transforms |
| Tailwind CSS | `^4.1.0` | v4 changed config format — use `tailwind.config.ts` with new API |
| TypeScript | `^5.8.0` | `noUncheckedIndexedAccess` available since 4.1, stable |
| Vitest | `^3.1.0` | Vitest 3 dropped deprecated APIs |
| Playwright | `^1.52.0` | Required for latest WXT E2E integration |
| FlexSearch | `^0.7.31` | No major release since; verify npm before pinning |
| idb | `^8.0.0` | idb 8 requires TypeScript 5+; matches our stack |
| Zod | `^3.24.0` | Runtime validation at trust boundaries |
| pnpm | `^10.0.0` | Use `packageManager` field in root `package.json` |

> **Action at scaffold time:** verify each package's latest **stable** release on npm individually. Pin **exact** versions (no `^` or `~` in `package.json`) — the floors above are the minimum accepted, not the values to copy. Commit `pnpm-lock.yaml`. Run `pnpm audit --audit-level=high` before every commit. **Never** run `npm-check-updates -u` unreviewed — each version bump requires a changelog and breaking-change check.

---

## Phase 0 — Project Scaffold

### Task 0.1: Initialize pnpm workspace + WXT project

**Description:** Create the root project with pnpm workspaces (`root` + `daemon/`), scaffold WXT with React + TypeScript, configure `tsconfig.json` with `strict: true` and `noUncheckedIndexedAccess: true`, add Tailwind CSS v4, ESLint (with `@typescript-eslint/no-explicit-any`), and Vitest.

**Acceptance criteria:**
- [ ] `pnpm install` succeeds with no audit errors
- [ ] `pnpm dev` launches WXT in Chrome without errors
- [ ] `pnpm typecheck` passes on the empty scaffold
- [ ] `pnpm lint` passes on the empty scaffold
- [ ] `pnpm test` runs (0 tests, no failures)
- [ ] `tsconfig.json` has `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitAny": true`
- [ ] `manifest.json` (via `wxt.config.ts`) contains only: `bookmarks`, `storage`, `sidePanel` — nothing else

**Verification:**
```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test
# DevTools → Extensions → Deepmarks → Inspect → Console: no errors
```

**Dependencies:** None

**Files touched:**
- `wxt.config.ts`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`
- `package.json`, `pnpm-workspace.yaml`, `.eslintrc.json`, `vitest.config.ts`
- `src/entrypoints/background.ts` (stub), `src/entrypoints/sidepanel/`, `src/entrypoints/popup/`, `src/entrypoints/options/`

**Estimated scope:** M

**Security checkpoints:**
- Confirm `manifest.json` has no `<all_urls>` host permission
- Confirm `content_security_policy` is set: `"script-src 'self'; object-src 'none';"`
- Confirm `web_accessible_resources` is empty (nothing to expose)

---

## Phase 1 — Data Foundation

### Task 1.1: Define core types

**Description:** Write all shared TypeScript types in `src/lib/bookmarks/types.ts`. These types are the contract everything else depends on. No runtime code here — pure types only.

**Acceptance criteria:**
- [ ] `BookmarkNode` has `id: string`, `title: string`, `url: string | undefined`, `parentId: string | undefined`, `dateAdded: number`, `meta: BookmarkMeta | undefined`
- [ ] `BookmarkMeta` has `category: Category | undefined`, `tags: string[]`, `classifiedAt: number | undefined`, `classifiedBy: ClassifyEngine`
- [ ] `Category` is a union of the 8 string literals (`tool | security | technique | launch | research | opinion | commerce | other`)
- [ ] `ClassifyEngine` is `'regex' | 'openai' | 'anthropic' | 'gemini'`
- [ ] All types are exported as named exports
- [ ] `pnpm typecheck` passes

**Verification:**
```bash
pnpm typecheck
```

**Dependencies:** Task 0.1

**Files touched:**
- `src/lib/bookmarks/types.ts`

**Estimated scope:** XS

---

### Task 1.2: IndexedDB schema + bookmark CRUD

**Description:** Define the IndexedDB schema using `idb` in `src/lib/storage/db.ts`. Implement bookmark CRUD (`upsert`, `getAll`, `getById`, `delete`) in `src/lib/storage/bookmarks.ts`. Schema version starts at `1`; include a migration stub with a clear comment that future changes increment version and add a migration function.

**Acceptance criteria:**
- [ ] `openDB('deepmarks', 1)` creates a `bookmarks` object store with `id` as keyPath and a `url` index
- [ ] `upsertBookmark(bookmark)` writes a `BookmarkNode` to the store
- [ ] `getAllBookmarks()` returns `BookmarkNode[]`
- [ ] `getBookmarkById(id)` returns `BookmarkNode | undefined`
- [ ] `deleteBookmark(id)` removes the record
- [ ] All functions return `Promise<Result<T>>` (never throw)
- [ ] Unit tests cover all five operations using `fake-indexeddb`
- [ ] Schema version and migration path are documented in a comment block

**Verification:**
```bash
pnpm test -- --reporter=verbose tests/unit/storage.test.ts
```

**Dependencies:** Task 1.1

**Files touched:**
- `src/lib/storage/db.ts`
- `src/lib/storage/bookmarks.ts`
- `tests/unit/storage.test.ts`

**Estimated scope:** M

**Security checkpoints:**
- All data passed to `upsertBookmark` must already be Zod-validated (the caller's responsibility — document this contract in JSDoc)
- No raw `chrome.bookmarks` data is written without going through the Zod validator first (enforced in Task 1.3)

---

### Task 1.3: Bookmark sync from chrome.bookmarks + Zod validation

**Description:** Implement `src/lib/bookmarks/sync.ts` to walk the `chrome.bookmarks.getTree()` result and produce `BookmarkNode[]`. Add a Zod schema (`RawBookmarkNodeSchema`) that validates each node from the API before conversion. Implement `src/lib/bookmarks/watch.ts` to listen to `chrome.bookmarks.onCreated`, `onChanged`, and `onRemoved`, calling sync + IndexedDB update on each event.

**Acceptance criteria:**
- [ ] `syncAllBookmarks()` reads the full tree and writes validated nodes to IndexedDB
- [ ] Any node that fails Zod validation is skipped and logged to `console.warn` (never throws, never silently corrupts DB)
- [ ] `startWatcher()` registers the three event listeners; `stopWatcher()` removes them (idempotent)
- [ ] Bookmark events are **debounced** with a 500ms window — a burst import of 100 bookmarks fires at most one reconciliation, not 100 individual full syncs
- [ ] Unit tests mock `chrome.bookmarks` via `vitest-chrome` and verify sync writes correct data
- [ ] Unit tests include a fixture with a malformed node (missing `id`) and verify it is skipped
- [ ] Unit tests include **malicious fixtures**: `javascript:alert(1)` URL (stored with `url: undefined`), `data:text/html,...` URL (rejected), title containing `<script>alert(1)</script>` (stored as plain text, never executed), title containing markdown image `![x](http://evil.com/track.gif)` (stored as plain text)

**Verification:**
```bash
pnpm test -- tests/unit/storage.test.ts
```

**Dependencies:** Task 1.2

**Files touched:**
- `src/lib/bookmarks/sync.ts`
- `src/lib/bookmarks/watch.ts`
- `tests/unit/storage.test.ts` (extended)
- `tests/fixtures/bookmarks.json` (500-bookmark fixture created here)

**Estimated scope:** M

**Security checkpoints:**
- Zod schema rejects nodes with non-string `id` or `title` — prevents type confusion attacks from corrupted bookmark data
- `url` field validated with an **explicit `http(s)` allowlist**: `z.string().regex(/^https?:\/\//i).optional()` — rejects `javascript:`, `data:`, `file:`, `chrome:`, and all other non-http(s) schemes. `z.string().url()` alone is **NOT** sufficient (accepts non-http schemes) and must not be used here
- Unit test asserts a bookmark with `url: "javascript:alert(1)"` is stored with `url: undefined`, never as a string

---

### Task 1.4: Background service worker — initial sync orchestration

**Description:** Wire up `src/entrypoints/background.ts` to call `syncAllBookmarks()` on `chrome.runtime.onInstalled` and `chrome.runtime.onStartup`, then start the watcher. Log sync results without exposing bookmark content.

**Acceptance criteria:**
- [ ] Background script calls `syncAllBookmarks()` on install and on browser start
- [ ] `startWatcher()` is called once and not re-called on subsequent events
- [ ] `console.log` shows only counts (e.g., `"Deepmarks: synced 342 bookmarks"`) — never URLs or titles
- [ ] Service worker stays alive during sync (uses `chrome.runtime.connect` keepalive pattern if needed for >30s syncs)
- [ ] `pnpm build && pnpm dev` works; DevTools service worker shows no errors

**Verification:**
```bash
pnpm dev
# Load extension in Chrome → DevTools → Service Worker → console shows sync count
```

**Dependencies:** Task 1.3

**Files touched:**
- `src/entrypoints/background.ts`

**Estimated scope:** S

---

### Checkpoint: Phase 1

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] Extension loads in Chrome without errors
- [ ] After loading, background service worker console shows a bookmark count
- [ ] DevTools → Application → IndexedDB → deepmarks → bookmarks shows records
- [ ] **Network tab is empty** (no outbound requests) — zero-network baseline established here

---

## Phase 2 — Search Index

### Task 2.1: FlexSearch index builder + query

**Description:** Implement `src/lib/search/index.ts` following the spec's code example exactly. The `buildIndex` function takes `BookmarkNode[]` and returns a `FlexSearch.Index`. The `search` function takes an index + bookmarks map + query string and returns `SearchResult[]`. Index tokens: `title`, `url`, `meta.tags`.

**Acceptance criteria:**
- [ ] `buildIndex(1000 bookmarks)` completes in < 50ms (measured with `performance.now()` in test)
- [ ] `search(index, map, 'github')` returns GitHub-related bookmarks ranked first
- [ ] `search(index, map, '')` returns `[]` (empty query → no results, not all results)
- [ ] `search(index, map, query, limit)` respects the `limit` parameter
- [ ] Unit tests cover: empty query, exact match, partial match, limit, non-existent query

**Verification:**
```bash
pnpm test -- tests/unit/search.test.ts
```

**Dependencies:** Task 1.1

**Files touched:**
- `src/lib/search/index.ts`
- `tests/unit/search.test.ts`
- `tests/fixtures/bookmarks.json` (used here)

**Estimated scope:** S

---

### Task 2.2: Index rebuild in background worker

**Description:** The background service worker maintains a live in-memory FlexSearch index. After `syncAllBookmarks()` completes, it builds the index from all bookmarks. After each `onCreated`/`onChanged`/`onRemoved` event, it incrementally updates the index (add/update/remove the single node). The index is accessible via a `chrome.runtime.sendMessage` handler.

**Acceptance criteria:**
- [ ] Background script builds index after initial sync
- [ ] Adding a bookmark in Chrome triggers an incremental index update (no full rebuild)
- [ ] Removing a bookmark removes it from the index
- [ ] `chrome.runtime.sendMessage({ type: 'SEARCH', query: 'github', limit: 20 })` returns ranked `SearchResult[]`
- [ ] Message handler uses structured clone (no functions in messages) and validates message shape with Zod

**Verification:**
```bash
pnpm dev
# DevTools console: chrome.runtime.sendMessage({type:'SEARCH', query:'github'}, console.log)
```

**Dependencies:** Task 1.4, Task 2.1

**Files touched:**
- `src/entrypoints/background.ts` (extended)

**Estimated scope:** S

**Security checkpoints:**
- Incoming message shapes validated with Zod: `z.object({ type: z.literal('SEARCH'), query: z.string().max(200), limit: z.number().int().min(1).max(100).optional() })`
- Message handler only responds to `chrome.runtime` internal messages (not from content scripts or external origins)

---

### Checkpoint: Phase 2

- [ ] `pnpm test -- tests/unit/search.test.ts` passes
- [ ] `pnpm typecheck` passes
- [ ] Manually sending a search message from DevTools returns correct results
- [ ] 1,000-bookmark search completes in < 200ms (verify via `performance.now()` wrapper in test)

---

## Phase 3 — Side Panel: Browse & Search

### Task 3.1: Side panel shell + BookmarkList + BookmarkCard

**Description:** Build the side panel React app. On mount, it queries IndexedDB directly via a cursor (page size 200) and renders `BookmarkList` → `BookmarkCard` for each result. Additional pages load on scroll. `BookmarkCard` shows title, a domain-initial letter badge (e.g. `G` for `github.com`), and URL. **No remote favicon requests.** No classification UI yet.

**Acceptance criteria:**
- [ ] Side panel opens via the toolbar icon (or `chrome.sidePanel.open`)
- [ ] On mount, the side panel reads bookmarks **directly from IndexedDB via a cursor** with a page limit of 200; it does **not** send a `GET_ALL` message to the background service worker. Subsequent pages are loaded incrementally as the user scrolls. This avoids structured-cloning the entire bookmark set across MV3 message boundaries and prevents freezing on large libraries
- [ ] `BookmarkList` uses **virtualized rendering** via `@tanstack/react-virtual` — only visible rows + 10 overscan rows are in the DOM at any time
- [ ] Performance test covers the **full data path** (IndexedDB read → state update → first visible render), not React row rendering alone: 1k, 10k bookmarks each complete end-to-end in ≤ 200ms via `performance.now()`. The 50k fixture is validated for scroll performance (no freeze after initial render); the 200ms SLA applies to first-page load only
- [ ] `BookmarkCard` renders `title` and truncated `url`; **no remote favicon requests** — show a letter badge from the domain's first character (e.g., `G` for `github.com`); zero network requests on panel open
- [ ] Clickable links in `BookmarkCard` are only rendered for `http:` and `https:` schemes; `javascript:`, `data:`, `file:`, `chrome:`, and all other schemes render as inert non-clickable text, never as anchor elements
- [ ] Empty state rendered when there are 0 bookmarks
- [ ] No `dangerouslySetInnerHTML` anywhere in the component tree

**Verification:**
```bash
pnpm dev
# Open side panel → bookmarks visible
# DevTools → Network: zero requests (no favicon, no remote resources of any kind)
# Load 10k+ bookmark fixture → measure initial render < 200ms via performance.now()
```

**Dependencies:** Task 2.2

**Files touched:**
- `src/entrypoints/sidepanel/App.tsx`, `main.tsx`, `index.html`
- `src/components/BookmarkList.tsx` (virtualized via `@tanstack/react-virtual`)
- `src/components/BookmarkCard.tsx`

> **New dependency:** `@tanstack/react-virtual` — get approval per spec boundaries before adding to `package.json`.

**Estimated scope:** M

---

### Task 3.2: SearchBar + live search

**Description:** Add `SearchBar` component to the side panel. On input change (debounced 150ms), send a `SEARCH` message to the background and replace `BookmarkList` with search results. Show result count. Clear button resets to full list.

**Acceptance criteria:**
- [ ] Typing in `SearchBar` triggers search after 150ms debounce
- [ ] Results update without full page re-render (use React state, not router navigation)
- [ ] "N results" count displayed
- [ ] Clear (×) button resets to full bookmark list
- [ ] Pressing Escape focuses the search bar
- [ ] 1,000 bookmarks → search response visible in < 200ms from keystroke (subjective + measured)

**Verification:**
```bash
pnpm dev
# Load 500-bookmark fixture → type in search bar → measure response time
```

**Dependencies:** Task 3.1

**Files touched:**
- `src/components/SearchBar.tsx`
- `src/entrypoints/sidepanel/App.tsx` (extended)

**Estimated scope:** S

---

### Task 3.3: CategoryFilter

**Description:** Add `CategoryFilter` component — a horizontal pill row showing each category with a count badge. Clicking a pill filters `BookmarkList` to that category. "All" pill shows total. Categories with 0 bookmarks are shown dimmed, not hidden.

**Acceptance criteria:**
- [ ] All 8 default categories render as filter pills with counts
- [ ] Clicking a category pill filters the list
- [ ] Clicking the active pill again deselects (shows all)
- [ ] Category filter and search can be combined (both active simultaneously)
- [ ] Counts are recomputed on every sync event

**Verification:**
```bash
pnpm dev
# Side panel → click "tool" pill → only tool-category bookmarks shown
```

**Dependencies:** Task 3.2

**Files touched:**
- `src/components/CategoryFilter.tsx`
- `src/entrypoints/sidepanel/App.tsx` (extended)

**Estimated scope:** S

---

### Checkpoint: Phase 3

- [ ] `pnpm test && pnpm typecheck && pnpm lint` pass
- [ ] Side panel opens, displays bookmarks, search + filter work end-to-end
- [ ] E2E test: `pnpm test:e2e -- sidepanel` — open panel, type query, verify results
- [ ] DevTools → Network: **zero requests** — panel opens with no outbound traffic of any kind
- [ ] Human review of UI before proceeding to classification

---

## Phase 4 — Classification Engine

### Task 4.1: Category definitions + regex classifier

**Description:** Implement `src/lib/classify/categories.ts` with the 8 default categories and their metadata (display name, icon hint, example domains). Implement `src/lib/classify/regex.ts` with domain/keyword rule sets for each category. Rules should cover the top 20+ known domains per category.

**Acceptance criteria:**
- [ ] Regex classifier correctly categorizes ≥ 80% of the 50-URL test fixture (measured in unit test)
- [ ] `github.com/*/..` → `tool`, `arxiv.org` → `research`, `cve.mitre.org` → `security`, product launches → `launch`
- [ ] Classifier always returns a result (falls back to `other`) — never throws
- [ ] No network requests made (pure function, pure regex)
- [ ] Unit tests include the 50-URL fixture and assert the 80% accuracy bar

**Verification:**
```bash
pnpm test -- tests/unit/classify.test.ts
```

**Dependencies:** Task 1.1

**Files touched:**
- `src/lib/classify/categories.ts`
- `src/lib/classify/regex.ts`
- `tests/unit/classify.test.ts`
- `tests/fixtures/bookmarks.json` (50-URL classification sub-fixture)

**Estimated scope:** M

---

### Task 4.2: BYOK classifier (OpenAI / Anthropic / Gemini)

**Description:** Implement `src/lib/classify/byok.ts`. The function reads the API key from `chrome.storage.local` (never from a parameter — to avoid key exposure in call stacks). Construct a minimal, prompt-injected-safe classification prompt. Validate the API response with Zod before returning.

**Acceptance criteria:**
- [ ] `classifyWithBYOK(url, title, engine)` returns `ClassifyResult` (spec's Result type)
- [ ] API key is read from `chrome.storage.local` inside the function — never passed as parameter
- [ ] Prompt template injects `url` and `title` into a structured slot (not free-form concatenation): `"Classify this bookmark:\nURL: {{url}}\nTitle: {{title}}\nCategories: ..."`
- [ ] Each request uses `AbortController` with a **10-second timeout**; timeout returns `{ ok: false, error: "Request timed out" }`
- [ ] Maximum **1 concurrent BYOK request** at a time; additional calls queue, they do not silently drop
- [ ] First BYOK classification (and any daemon-triggered classification) shows a one-time consent dialog: _"This will send the bookmark URL and title to [provider]. Proceed?"_ — acknowledged flag stored in `chrome.storage.local`; consent can be revoked from Settings
- [ ] API response is validated with Zod; invalid response → `{ ok: false, error: "..." }`
- [ ] Network errors return `{ ok: false, error: "..." }` — never throw
- [ ] Unit tests: valid response → correct category; invalid JSON → graceful error; no key configured → `{ ok: false, error: "No API key configured" }`; timeout fires after mock delay → graceful error
- [ ] BYOK test mocks `fetch` — no real network in tests

**Verification:**
```bash
pnpm test -- tests/unit/classify.test.ts
```

**Dependencies:** Task 4.1

**Files touched:**
- `src/lib/classify/byok.ts`
- `tests/unit/classify.test.ts` (extended)

**Estimated scope:** M

**Security checkpoints:**
- API key never appears in console logs, error messages, or exported data
- Prompt template uses a structured format that separates system instructions from user data (prevents prompt injection via bookmark title)
- Fetch is made to the official API endpoint only (hardcoded URLs, not user-configurable)
- Response JSON is parsed with `JSON.parse` inside try/catch, then validated with Zod — no `eval`

---

### Task 4.3: Classify router + ClassifyPanel UI

**Description:** Implement `src/lib/classify/router.ts`. The `classify()` function reads whether a BYOK key is set; if yes, delegates to `classifyWithBYOK`, falling back to regex if BYOK fails. Implement `ClassifyPanel` component showing the active engine badge and a "Classify" button per bookmark.

**Acceptance criteria:**
- [ ] `classify(url, title)` uses BYOK when key is configured, regex otherwise
- [ ] BYOK failure (network error, invalid key) falls back to regex — never surfaces an error to the user without also providing a regex result
- [ ] `ClassifyPanel` shows `"Engine: Regex (offline)"` or `"Engine: GPT-4o (BYOK)"` before user clicks Classify
- [ ] Classifying a bookmark writes the result back to IndexedDB and updates the bookmark's `meta.category` (**IndexedDB only** — `chrome.bookmarks.update()` is NOT called; Chrome's native bookmark manager titles stay unchanged; this is resolved decision Q2)
- [ ] Unit test: BYOK configured + BYOK fails → router falls back to regex

**Verification:**
```bash
pnpm test -- tests/unit/classify.test.ts
pnpm dev
# Open side panel → click Classify on a GitHub bookmark → category "tool" appears
```

**Dependencies:** Task 4.2, Task 3.1

**Files touched:**
- `src/lib/classify/router.ts`
- `src/components/ClassifyPanel.tsx`
- `src/lib/storage/bookmarks.ts` (update meta)

**Estimated scope:** M

---

### Checkpoint: Phase 4

- [ ] `pnpm test && pnpm typecheck && pnpm lint` pass
- [ ] Classify panel shows correct engine badge before and after configuring a BYOK key
- [ ] Regex classifier hits ≥ 80% on fixture
- [ ] DevTools → Network in regex mode: **zero requests**
- [ ] Human review of classification results on real bookmarks before proceeding

---

## Phase 5 — Settings & Options

### Task 5.1: Options page — BYOK key input + engine status

**Description:** Build `src/entrypoints/options/App.tsx` with `BYOKInput` (provider selector + masked key field → saved to `chrome.storage.local`) and `ClassifyEngineStatus` (reads current active engine; shows green/yellow status).

**Acceptance criteria:**
- [ ] Provider selector: OpenAI, Anthropic, Gemini
- [ ] Key field is `type="password"` and never shown in plaintext after save
- [ ] "Save" writes to `chrome.storage.local` with key `byok_${provider}` — not to `chrome.storage.sync`
- [ ] "Remove" deletes the key from storage
- [ ] Status indicator updates immediately when a key is saved or removed (re-reads storage)
- [ ] No key is ever written to `console.log`, DOM attributes, or `chrome.storage.sync`

**Verification:**
```bash
pnpm dev
# Options page → enter key → check chrome.storage.local in DevTools → verify key stored, not in sync
# Verify key never appears in console
```

**Dependencies:** Task 4.3

**Files touched:**
- `src/entrypoints/options/App.tsx`, `index.html`
- `src/components/Settings/BYOKInput.tsx`
- `src/components/Settings/ClassifyEngineStatus.tsx`
- `src/lib/storage/settings.ts`

**Estimated scope:** M

**Security checkpoints:**
- Keys stored under `byok_${provider}` in `chrome.storage.local` — confirm they do NOT appear in `chrome.storage.sync`
- Input field is `autocomplete="off"` to prevent browser password manager capture
- Confirm key is never exposed in React component props or state that's visible in React DevTools (use a getter pattern)

---

### Task 5.2: Category editor

**Description:** Build `CategoryEditor` component in options. Users can rename, delete, or add categories. Custom categories stored in `chrome.storage.sync` (syncs across user's browsers). Default categories are restored if the user deletes all.

**Acceptance criteria:**
- [ ] Default 8 categories shown with edit/delete actions
- [ ] "Add category" opens an inline form; saving writes to `chrome.storage.sync`
- [ ] "Restore defaults" resets to the 8 defaults
- [ ] Category names are validated: non-empty, max 32 chars, alphanumeric + spaces only (Zod)
- [ ] Changes are reflected in `CategoryFilter` in the side panel (via storage change event)

**Verification:**
```bash
pnpm dev
# Options → add custom category → switch to side panel → new category appears in filter pills
```

**Dependencies:** Task 5.1, Task 3.3

**Files touched:**
- `src/components/Settings/CategoryEditor.tsx`
- `src/lib/storage/settings.ts` (extended)
- `src/lib/classify/categories.ts` (reads from storage)

**Estimated scope:** M

---

### Task 5.3: Popup

**Description:** Build `src/entrypoints/popup/App.tsx` — a minimal popup showing bookmark count, current classification engine, and a quick link to open the side panel and options.

**Acceptance criteria:**
- [ ] Shows total bookmark count from IndexedDB
- [ ] Shows active engine: "Regex (offline)" or "OpenAI (BYOK)"
- [ ] "Open Side Panel" button calls `chrome.sidePanel.open()`
- [ ] "Settings" button opens the options page

**Verification:**
```bash
pnpm dev
# Click extension toolbar icon → popup appears with correct count and engine
```

**Dependencies:** Task 5.1

**Files touched:**
- `src/entrypoints/popup/App.tsx`, `index.html`

**Estimated scope:** S

---

### Checkpoint: Phase 5

- [ ] `pnpm test && pnpm typecheck && pnpm lint` pass
- [ ] Full settings flow works: add BYOK key → engine badge changes → remove key → back to regex
- [ ] Category editor: add → appears in side panel; delete → gone; restore → defaults back
- [ ] Popup shows correct state
- [ ] DevTools → Storage → chrome.storage.local: BYOK key present; chrome.storage.sync: categories only

---

## Phase 6 — Wiki & Agent Export

### Task 6.1: Wiki compiler

**Description:** Implement `src/lib/wiki/compile.ts`. Takes all classified bookmarks from IndexedDB and produces a structured wiki: one section per category, each bookmark as a markdown link with tags. Inter-links are `[[category]]` references (fieldtheory-style). The compiler is a pure function (takes `BookmarkNode[]`, returns `string`).

**Acceptance criteria:**
- [ ] Wiki output is valid markdown (no raw HTML)
- [ ] Each category section has a heading and a list of bookmark links
- [ ] `[[tool]]` references link to the `## Tool` section anchor
- [ ] Uncategorized bookmarks appear under `## Other`
- [ ] Unit test: compile 50 classified bookmarks → assert markdown structure
- [ ] Compiler handles empty categories gracefully (section is omitted, not empty `##`)

**Verification:**
```bash
pnpm test -- tests/unit/wiki.test.ts
```

**Dependencies:** Task 1.2, Task 4.1

**Files touched:**
- `src/lib/wiki/compile.ts`
- `tests/unit/wiki.test.ts`

**Estimated scope:** S

---

### Task 6.2: Agent export (JSON + markdown) + WikiView UI

**Description:** Implement `src/lib/agent/export.ts` — produces `bookmarks-export.json` (all bookmarks with metadata) and calls `src/lib/wiki/export.ts` to write `bookmarks-wiki.md` via the File System Access API. Add `WikiView` component to the side panel. Add "Export for Agents" button.

**Acceptance criteria:**
- [ ] `exportJSON()` returns a JSON string with all `BookmarkNode[]` — Zod-validated shape
- [ ] "Export for Agents" button opens a directory picker (File System Access API); writes both files
- [ ] `WikiView` renders compiled wiki markdown in the side panel (use a safe markdown renderer — no `innerHTML`)
- [ ] Export JSON contains no API keys or internal state — only bookmark data + categories
- [ ] Unit test: `exportJSON()` output parses correctly with `JSON.parse` and matches `BookmarkNode[]` schema

**Verification:**
```bash
pnpm dev
# Side panel → Wiki tab → wiki renders
# Export button → pick folder → verify two files written
```

**Dependencies:** Task 6.1, Task 3.1

**Files touched:**
- `src/lib/agent/export.ts`
- `src/lib/wiki/export.ts`
- `src/components/WikiView.tsx`
- `src/entrypoints/sidepanel/App.tsx` (add Wiki tab + Export button)
- `tests/unit/wiki.test.ts` (extended)

**Estimated scope:** M

**Security checkpoints:**
- Export JSON must be scrubbed of any BYOK API key references before write
- File System Access API requires explicit user gesture (button click) — never auto-export
- Markdown renderer must use `react-markdown` with `skipHtml: true` and `rehype-sanitize` with a strict allowlist schema — renders to React elements, never to raw HTML strings. `marked` with `sanitize: true` was removed in marked v5+ and must **not** be referenced
- All URLs in rendered markdown must pass through an `http(s)?://` allowlist before being rendered as anchor elements; `javascript:`, `data:`, and all other schemes render as inert text

---

### Checkpoint: Phase 6

- [ ] `pnpm test && pnpm typecheck && pnpm lint` pass
- [ ] Wiki view renders correctly in side panel
- [ ] Export produces valid JSON + markdown files
- [ ] Exported JSON has no API keys
- [ ] Human review of export format before daemon phase (export format is the daemon's input)

---

## Phase 7 — Companion Daemon

### Task 7.1: Native Messaging bridge (extension side)

**Description:** Implement `src/lib/agent/native-messaging.ts` and wire it into `src/entrypoints/background.ts`. The extension connects to the daemon via `chrome.runtime.connectNative('com.deepmarks.daemon')`. Define the message protocol types in a shared `types.ts`. Validate all incoming daemon messages with Zod.

**Acceptance criteria:**
- [ ] Background script connects to daemon on first MCP tool call (lazy connect, not on startup)
- [ ] Connection is re-established if port disconnects
- [ ] All incoming messages from daemon are Zod-validated before processing
- [ ] Extension verifies it is only connected to the registered `com.deepmarks.daemon` host (not spoofable)
- [ ] If daemon is not installed, side panel shows a banner: "Install daemon to enable agent integration"

**Verification:**
```bash
# Manual: install daemon stub → verify connection in background console
```

**Dependencies:** Task 2.2, Task 4.3, Task 6.2

**Files touched:**
- `src/lib/agent/native-messaging.ts`
- `src/entrypoints/background.ts` (extended)

**Estimated scope:** S

---

### Task 7.2: Daemon — Native Messaging host + MCP HTTP server

**Description:** Build `daemon/` as a separate pnpm workspace package. The daemon is a Node.js process that receives Native Messaging messages from the extension (via `stdin`/`stdout` framed JSON) and serves an HTTP MCP server on `127.0.0.1:6789`. Implement the 5 MCP tools: `search_bookmarks`, `list_categories`, `get_bookmark`, `export_wiki`, `classify_bookmark`.

**Acceptance criteria:**
- [ ] Daemon process starts with `node daemon/dist/index.js`
- [ ] HTTP server binds `127.0.0.1:6789` — verified with `lsof -nP -iTCP:6789 -sTCP:LISTEN | grep 127.0.0.1` (macOS/Linux); `netstat -an | findstr "127.0.0.1:6789"` (Windows)
- [ ] Every request requires `Authorization: Bearer <secret>` header; missing or wrong token → 401 immediately with no further processing; no other auth header accepted
- [ ] `Origin` header validated as a **second defense**: if present, only `http://localhost` and `http://127.0.0.1` are accepted — any other `Origin` value → 403; if absent, the bearer token alone is sufficient (non-browser MCP clients such as Claude Code and Codex may omit `Origin`)
- [ ] `classify_bookmark` MCP tool is **disabled by default**; only exposed if the user has explicitly enabled remote classification in Options AND a BYOK key is present; tool is omitted from the MCP tools list when disabled
- [ ] All 5 MCP tools return correct responses when enabled
- [ ] `search_bookmarks` relays query to extension via Native Messaging and returns results in < 500ms
- [ ] Daemon TypeScript compiles to a single bundle (no `node_modules` at runtime — bundle with `esbuild`)

**Verification:**
```bash
pnpm build:daemon
node daemon/dist/index.js &
curl -H "Authorization: Bearer $(cat ~/.deepmarks/daemon.secret)" \
  -H "Origin: http://localhost" \
  http://127.0.0.1:6789/mcp/search_bookmarks -d '{"query":"github"}'
# Verify 401 with wrong secret:
curl -H "Authorization: Bearer wrongsecret" http://127.0.0.1:6789/mcp/search_bookmarks
```

**Dependencies:** Task 7.1

**Files touched:**
- `daemon/src/index.ts`
- `daemon/src/mcp-tools.ts`
- `daemon/src/types.ts`
- `daemon/package.json`, `daemon/tsconfig.json`

**Estimated scope:** L

**Security checkpoints:**
- HTTP server: `server.listen(6789, '127.0.0.1', ...)` — NOT `server.listen(6789)` (which binds `0.0.0.0`)
- CORS: `Access-Control-Allow-Origin: http://localhost` only; never `*`
- Auth: `Authorization: Bearer <secret>` is the **sole** auth mechanism; middleware rejects before any routing; header-spoofing via `X-Deepmarks-Secret` must NOT be used (can be forwarded by proxies)
- Shared secret: 32-byte random hex via `crypto.randomBytes(32).toString('hex')` at install time; stored at `~/.deepmarks/daemon.secret` with file permissions `0600`; never hardcoded or logged
- `classify_bookmark` tool: disabled unless user opted in in extension Settings AND a BYOK key is present; always logs consent decision, never logs the bookmark content itself
- Native Messaging stdin/stdout: use fixed-length framing (4-byte little-endian length prefix) per Chrome spec
- No `eval` or `new Function` in daemon code
- Daemon log: never log bookmark content or API keys — only operation names and counts

---

### Task 7.3: install.sh — daemon registration

**Description:** Write `daemon/install.sh` that: generates the shared secret if not exists, writes the native messaging host manifest to the OS-specific location (macOS, Linux, Windows), and prints setup instructions for adding the MCP server to Claude/Codex config.

**Acceptance criteria:**
- [ ] Script works on macOS (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`) and Linux (`~/.config/google-chrome/NativeMessagingHosts/`)
- [ ] Windows: writes to `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.deepmarks.daemon` (PowerShell fallback)
- [ ] Firefox manifest written to `~/.mozilla/native-messaging-hosts/com.deepmarks.daemon.json` on macOS/Linux if Firefox is detected
- [ ] **Windows Firefox**: manifest written to `HKCU\Software\Mozilla\NativeMessagingHosts\com.deepmarks.daemon` via PowerShell; verification: `reg query "HKCU\Software\Mozilla\NativeMessagingHosts\com.deepmarks.daemon"` exits 0
- [ ] Shared secret generated with `openssl rand -hex 32` or Node `crypto` if openssl not available
- [ ] Script is idempotent (running twice does not break anything)
- [ ] Script prints the full MCP config snippet including the `Authorization: Bearer` header, e.g.:
  ```json
  {
    "url": "http://127.0.0.1:6789",
    "headers": { "Authorization": "Bearer <secret>" }
  }
  ```
  where `<secret>` is replaced with the actual generated secret; the snippet is ready to paste without editing
- [ ] Verification step: `curl -H "Authorization: Bearer $(cat ~/.deepmarks/daemon.secret)" http://127.0.0.1:6789/mcp/search_bookmarks` returns 200; `curl http://127.0.0.1:6789/mcp/search_bookmarks` (no token) returns 401

**Verification:**
```bash
bash daemon/install.sh
# Check manifest file exists at expected path
# Check ~/.deepmarks/daemon.secret exists
```

**Dependencies:** Task 7.2

**Files touched:**
- `daemon/install.sh`

**Estimated scope:** S

---

### Checkpoint: Phase 7

- [ ] `pnpm build:daemon && pnpm install:daemon` succeeds
- [ ] Daemon connects to extension (background console shows "Daemon connected")
- [ ] `search_bookmarks` MCP tool returns correct results from a Claude Code REPL
- [ ] `curl` to `0.0.0.0:6789` is refused (only 127.0.0.1 works)
- [ ] Request without correct secret returns 401
- [ ] Human review of MCP tool interface before final QA phase

---

## Phase 8 — Security Hardening & QA

### Task 8.1: CSP + permissions audit

**Description:** Audit the final `manifest.json` and all entrypoints. Verify the minimal permission set. Run `pnpm build` and inspect the output bundle for any CSP violations. Verify no `eval`, `new Function`, or `innerHTML` in any source file.

**Acceptance criteria:**
- [ ] `grep -r "innerHTML\|dangerouslySetInnerHTML\|new Function\|eval(" src/` returns no results
- [ ] `manifest.json` permissions: `["bookmarks", "storage", "sidePanel", "nativeMessaging"]` only
- [ ] `host_permissions`: **strictly empty** in v1 — no favicon API, no external domain exceptions; any future addition requires explicit approval per the Boundaries rules
- [ ] CSP header: `"script-src 'self'; object-src 'none';"` in manifest
- [ ] `pnpm build` output shows no CSP warnings

**Verification:**
```bash
grep -r "innerHTML\|dangerouslySetInnerHTML\|new Function\|eval(" src/
pnpm build 2>&1 | grep -i csp
```

**Dependencies:** All previous tasks

**Files touched:**
- `wxt.config.ts` (manifest CSP)

**Estimated scope:** XS

---

### Task 8.2: Bundle size audit

**Description:** Measure each entrypoint bundle size after production build. Document sizes in `README.md`. If any entrypoint exceeds 2MB, identify and remove/lazy-load the offending dependency.

**Acceptance criteria:**
- [ ] Background service worker: < 500KB
- [ ] Side panel: < 2MB
- [ ] Popup: < 200KB
- [ ] Options: < 500KB
- [ ] Daemon bundle: < 5MB (includes Node.js code; acceptable for developer tool)
- [ ] transformers.js is NOT imported anywhere in source (verified by `grep -r "transformers" src/`)

**Verification:**
```bash
pnpm build
ls -lh .output/chrome-mv3/
```

**Dependencies:** Task 8.1

**Files touched:**
- `README.md` (add bundle size table)

**Estimated scope:** XS

---

### Task 8.3: Full unit + integration test pass

**Description:** Ensure all unit tests pass with ≥ 80% coverage across `src/lib/**`. Add any missing tests identified during phases 1–7.

**Acceptance criteria:**
- [ ] `pnpm test:coverage` shows ≥ 80% line coverage for `src/lib/**`
- [ ] No skipped tests (`xit`, `it.skip`, `test.skip`)
- [ ] All key scenarios from spec's testing strategy are covered (listed in plan intro)
- [ ] `pnpm typecheck` passes with zero errors

**Verification:**
```bash
pnpm test:coverage
pnpm typecheck
```

**Dependencies:** All previous tasks

**Files touched:**
- `tests/unit/*.test.ts` (additions only)

**Estimated scope:** M

---

### Task 8.4: E2E test suite

**Description:** Write the Playwright E2E tests for the side panel's happy paths. Use WXT's E2E framework to load the real extension in a real browser.

**Acceptance criteria:**
- [ ] `pnpm test:e2e` passes all scenarios
- [ ] Tests cover: side panel opens, bookmarks visible, search returns results, classify button works in regex mode, export writes file
- [ ] Tests do NOT use a real BYOK key (mock the API call)
- [ ] Tests run in CI without requiring a browser profile

**Verification:**
```bash
pnpm build && pnpm test:e2e
```

**Dependencies:** Task 8.3

**Files touched:**
- `tests/e2e/sidepanel.spec.ts`

**Estimated scope:** M

---

### Task 8.5: Privacy verification + README

**Description:** Final privacy check: proxy all traffic through Burp Suite Community / mitmproxy during a full use session (load extension, sync, classify with regex, export, classify with a test BYOK key). Verify no PII leaks. Write final `README.md`.

**Acceptance criteria:**
- [ ] Zero outbound requests in regex/offline mode (Burp confirms)
- [ ] BYOK mode: only requests to configured API provider's official endpoint; no other hosts
- [ ] No bookmark URLs, titles, or categories in any request other than the BYOK API call
- [ ] `README.md` includes: install instructions, BYOK setup, daemon install, MCP config example, privacy statement, contributing guide, MIT license badge

**Verification:**
- Manual Burp Suite session
- `pnpm build && cat README.md`

**Dependencies:** Task 8.4

**Files touched:**
- `README.md`

**Estimated scope:** S

---

### Checkpoint: Phase 8 — Ship Gate

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all pass
- [ ] All acceptance criteria from spec are checked
- [ ] Bundle sizes within limits
- [ ] Privacy audit clean
- [ ] `pnpm zip && pnpm zip:firefox` produces submittable packages
- [ ] Human sign-off on all 8 success criteria from spec

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| FlexSearch 0.7.x has known issues in service workers | High | Test search in SW context during Task 2.2; fall back to main-thread search via offscreen document if needed |
| WXT 1.x (if released) has breaking API changes from 0.19 | Medium | Check WXT changelog at scaffold time; use `0.20.x` as the version floor and pin the exact stable version found if 1.x is too new |
| `chrome.storage.local` quota (10MB default) exceeded by large bookmark sets | Medium | Store **all bookmark and classification metadata in IndexedDB** (no quota limit); `chrome.storage.local` holds only BYOK keys and small local settings; `chrome.storage.sync` holds only category definitions |
| Native Messaging protocol breaks on Firefox | Medium | Test on Firefox in Task 7.2; WXT's `browser` shim handles the API difference |
| BYOK API shape changes (OpenAI response format) | Low | Zod validation will surface this immediately; update schema in byok.ts |
| File System Access API not available in Firefox extension context | Medium | Detect API availability; fall back to `chrome.downloads.download()` blob URL approach |
| Daemon port 6789 already in use | Low | `install.sh` detects conflict via `lsof`/`netstat` and prompts for an alternative port; writes the chosen port to `~/.deepmarks/config.json`; extension reads the active port from the daemon's startup handshake message — no hard-coded port in the extension |
| Prompt injection via malicious bookmark title in BYOK mode | High | Structured prompt template with explicit slots; title and URL are injected as user-controlled data, not as instructions |

---

## Resolved Decisions (from planning Q&A)

| # | Question | Decision |
|---|---|---|
| Q1 | Favicon privacy | **Overridden by adversary review**: no remote favicons in v1. The zero-network success criterion (#3) is incompatible with outbound requests on every panel open. `BookmarkCard` displays a domain-initial letter badge instead (e.g., `G` for github.com). User's original preference (Google S2) noted for v2 consideration. |
| Q2 | Category write-back to Chrome | Store category **only in IndexedDB**. `chrome.bookmarks.update()` is NOT called — Chrome's native bookmark manager titles stay unchanged. |
| Q3 | Daemon port | Default `6789`; configurable in Options page (Settings → Daemon → Port). **Mechanism**: the port lives in `~/.deepmarks/config.json` (owned by the daemon process / `install.sh`). The extension Options page sends a Native Messaging command asking the daemon to update its config and restart on the new port. The extension then reads the active port from the daemon's next startup handshake message. The extension never writes the config file directly. |
| Q4 | Firefox + daemon on Windows | **Implement Windows Firefox registry support in v1.** Write the manifest to `HKCU\Software\Mozilla\NativeMessagingHosts\com.deepmarks.daemon` in `install.sh` (PowerShell). |

> **Impact on tasks:**
> - Task 3.1: No remote favicons — `BookmarkCard` shows a domain-initial letter badge (e.g., `G` for github.com); zero network requests on panel open.
> - Task 4.3: `ClassifyPanel` writes to IndexedDB only; no `chrome.bookmarks.update()` call.
> - Task 7.2: Daemon reads port from `~/.deepmarks/config.json`; defaults to 6789.
> - Task 7.3: `install.sh` handles macOS + Linux + Windows Chrome + Windows Firefox registry paths.

---

## Parallelization Opportunities

After Checkpoint Phase 1, the following can be worked in parallel:

| Stream A | Stream B |
|---|---|
| Phase 2 (Search) → Phase 3 (Side Panel) | Phase 4 (Classification Engine) |
| Phase 6 (Wiki + Export) | Phase 5 (Settings) |

Stream A and Stream B only merge at Phase 5 (ClassifyPanel needs both search UI and the classifier). Phase 7 (Daemon) depends on the complete message protocol defined in Stream A.
