# Deepmarks — Task List

> Derived from `tasks/plan.md`. Check off tasks as they complete.  
> Use vertical slices: complete one task fully (code + tests + passing CI) before starting the next.

---

## Phase 0 — Project Scaffold

- [ ] **Task 0.1** — Initialize pnpm workspace + WXT project (TypeScript strict, Tailwind v4, ESLint, Vitest, minimal manifest permissions)

**Checkpoint 0:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass; manifest has only `bookmarks`, `storage`, `sidePanel`

---

## Phase 1 — Data Foundation

- [ ] **Task 1.1** — Define core types (`BookmarkNode`, `BookmarkMeta`, `Category`, `ClassifyEngine`) in `src/lib/bookmarks/types.ts`
- [ ] **Task 1.2** — IndexedDB schema + bookmark CRUD (`upsert`, `getAll`, `getById`, `delete`) via `idb`; unit tests with `fake-indexeddb`
- [ ] **Task 1.3** — Bookmark sync from `chrome.bookmarks` + Zod validation at API boundary + bookmark watcher; 500-bookmark fixture created
- [ ] **Task 1.4** — Background service worker: sync on install + startup; watcher registered; logs counts only

**Checkpoint 1:** All tests pass; extension loads; IndexedDB has bookmark records; Network tab empty

---

## Phase 2 — Search Index

- [ ] **Task 2.1** — FlexSearch index builder + query (`buildIndex`, `search`); unit tests including 1,000-bookmark perf assertion (< 50ms build, < 200ms query)
- [ ] **Task 2.2** — Index rebuild in background worker; incremental update on bookmark events; `SEARCH` message handler with Zod-validated input

**Checkpoint 2:** `pnpm test` passes; manual search message from DevTools returns results in < 200ms

---

## Phase 3 — Side Panel: Browse & Search

- [ ] **Task 3.1** — Side panel shell + `BookmarkList` (virtualized via `@tanstack/react-virtual`) + `BookmarkCard` (title, domain-initial letter badge, URL; **no remote favicons, no `GET_ALL` message**); bookmarks loaded from IndexedDB via cursor (page size 200); URL scheme guard; empty state
- [ ] **Task 3.2** — `SearchBar` with 150ms debounce, result count, clear button, Escape-to-focus
- [ ] **Task 3.3** — `CategoryFilter` pill row with counts; combined filter + search

**Checkpoint 3:** Side panel opens, all bookmarks visible, search + filter work; **Network tab shows zero requests** (no favicons, no remote resources); 10k bookmark fixture renders in ≤ 200ms; E2E test passes; **human review of UI**

---

## Phase 4 — Classification Engine

- [ ] **Task 4.1** — `categories.ts` (8 defaults) + `regex.ts` (domain/keyword rules, ≥ 80% accuracy on 50-URL fixture); unit tests
- [ ] **Task 4.2** — `byok.ts` (OpenAI / Anthropic / Gemini); structured prompt template; 10s `AbortController` timeout; 1-concurrent queue; first-use consent dialog; Zod response validation; API key read from `chrome.storage.local` only; unit tests with mocked fetch
- [ ] **Task 4.3** — `router.ts` (BYOK → regex fallback); `ClassifyPanel` with engine badge; writes result to IndexedDB only (no `chrome.bookmarks.update()`)

**Checkpoint 4:** Tests pass; regex engine badge shows "offline"; BYOK badge shows after key is set; Network tab empty in regex mode; **human review of classification results**

---

## Phase 5 — Settings & Options

- [ ] **Task 5.1** — Options page: `BYOKInput` (provider + masked key → `chrome.storage.local`) + `ClassifyEngineStatus`; key never logged or synced
- [ ] **Task 5.2** — `CategoryEditor`: add/rename/delete/restore defaults; changes sync to side panel via storage event
- [ ] **Task 5.3** — Popup: bookmark count, active engine, links to side panel + options

**Checkpoint 5:** Full settings flow; BYOK key in `chrome.storage.local`, categories in `chrome.storage.sync`; popup shows correct state

---

## Phase 6 — Wiki & Agent Export

- [ ] **Task 6.1** — Wiki compiler (`compile.ts`): pure function, one section per category, inter-links, omits empty sections; unit tests
- [ ] **Task 6.2** — Agent export (`export.ts`): `bookmarks-export.json` + `bookmarks-wiki.md` via File System Access API; `WikiView` component; "Export for Agents" button; no API keys in output

**Checkpoint 6:** Wiki renders in side panel; export writes valid files; JSON passes Zod schema check; **human review of export format before daemon phase**

---

## Phase 7 — Companion Daemon

- [ ] **Task 7.1** — Native Messaging bridge in extension background (`native-messaging.ts`); lazy connect; Zod validation on all daemon messages; "daemon not installed" banner
- [ ] **Task 7.2** — `daemon/` workspace: Node.js Native Messaging host + HTTP server on `127.0.0.1:6789`; **`Authorization: Bearer <secret>` required on every request — missing or wrong token returns 401 immediately before any routing**; `Origin` header validated as a second defense (browser-only; non-browser MCP clients omit it, bearer token is sufficient); 5 MCP tools; **`classify_bookmark` disabled by default — only exposed when remote classification is enabled in Options AND a BYOK key is present**; esbuild bundle
- [ ] **Task 7.3** — `install.sh`: macOS + Linux + Windows; generates shared secret; idempotent; prints MCP config snippet

**Checkpoint 7:** Daemon connects; `search_bookmarks` works from Claude Code REPL; `curl 0.0.0.0:6789` refused; missing secret → 401; **human review of MCP interface**

---

## Phase 8 — Security Hardening & QA

- [ ] **Task 8.1** — CSP + permissions audit: `grep` for `innerHTML` / `eval`; verify minimal manifest permissions; `pnpm build` with no CSP warnings
- [ ] **Task 8.2** — Bundle size audit: all entrypoints within limits; no transformers.js imported; sizes documented in `README.md`
- [ ] **Task 8.3** — Full unit test pass: ≥ 80% coverage on `src/lib/**`; no skipped tests; `pnpm typecheck` clean
- [ ] **Task 8.4** — E2E test suite: Playwright happy paths (open panel, search, classify, export); no real BYOK keys in tests
- [ ] **Task 8.5** — Privacy verification (Burp/mitmproxy): zero outbound in regex mode; only API provider in BYOK mode; write `README.md`

**Checkpoint 8 — SHIP GATE:** All tests pass; bundle sizes within limits; privacy audit clean; `pnpm zip && pnpm zip:firefox` produce valid packages; **human sign-off on all 8 spec success criteria**

---

## Resolved Decisions

- [x] **Q1** — ~~Google S2 favicons~~ **Overridden by adversary review**: no remote favicons in v1. Domain-initial letter badge instead. Zero network on panel open. Satisfies zero-network success criterion (#3).
- [x] **Q2** — Category stored in IndexedDB only. Chrome's native bookmark titles are NOT modified.
- [x] **Q3** — Port defaults to `6789`; configurable in Options page (Settings → Daemon → Port). **The daemon owns `~/.deepmarks/config.json` and reads its own port from there.** The extension does NOT write this file directly; any port change is sent to the daemon over Native Messaging, and the daemon persists it to `~/.deepmarks/config.json`. Chrome extension storage and daemon config are separate; they stay in sync only through the Native Messaging protocol.
- [x] **Q4** — Windows Firefox registry support implemented in v1 (`install.sh` writes `HKCU\Software\Mozilla\NativeMessagingHosts\...` via PowerShell).
