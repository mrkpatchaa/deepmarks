# Spec: Deepmarks — AI-Enhanced Local Bookmark Manager

> **Analogy:** fieldtheory-cli for Google Chrome (and Firefox) bookmarks.  
> **Guiding principle:** Everything runs in the browser. Zero cloud. Zero accounts. Zero data exfiltration.

---

## Objective

Build an open-source, local-first browser extension that brings the power of
fieldtheory-cli to native Chrome and Firefox bookmarks. Users can search, classify,
and query their bookmarks with AI — without any data leaving their machine.

### Who is this for?

- **Developers and knowledge workers** with hundreds or thousands of Chrome bookmarks who can't find things.
- **Privacy-conscious users** who won't hand their browsing data to a SaaS (SaveDay, PlutoAI, LinkMinds are all cloud-first).
- **AI agent users** (Claude Code, Codex, etc.) who want their bookmarks queryable like a knowledge base.

### Why build this? (Market analysis — May 2026)

| Existing solution | Users | Problem |
|---|---|---|
| SaveDay | 6,000 | Cloud-only, parallel silo (not native bookmarks), requires account |
| Markly | 208 | Only auto-files into folders; no search, wiki, or agent integration |
| PlutoAI | 358 | Cloud SaaS, tab manager hybrid, no developer/agent focus |
| LinkMinds | ~0 | Brand new, cloud, no agent integration |
| Open source (GitHub) | max 5★ | Fragmented prototypes, no dominant project |

**The gap:** No tool is local-first, works on native Chrome bookmarks, and exposes them to AI coding agents. That's the niche.

### fieldtheory-cli → Deepmarks mapping

| fieldtheory-cli | Deepmarks |
|---|---|
| `ft sync` | Auto-syncs from `chrome.bookmarks` / `browser.bookmarks` API (always live) |
| `ft search "query"` | Side panel full-text + semantic search |
| `ft classify` | Regex first; BYOK API key unlocks higher-accuracy LLM classification |
| `ft classify --regex` | Always-available, zero-deps regex classifier (default) |
| `ft wiki` | Knowledge base view: classified bookmarks as interlinked markdown |
| `ft ask <question>` | RAG over your bookmarks via agent MCP tool |
| `ft skill install` | `daemon/install.sh` → registers local MCP server |
| SQLite FTS5 | FlexSearch + IndexedDB |
| `~/.fieldtheory/` | IndexedDB + File System Access API |

### Acceptance Criteria

- [ ] User can open the side panel and search 1,000+ bookmarks in < 200ms
- [ ] Regex classifier categorizes bookmarks with zero network — always available, no setup
- [ ] If user has configured a BYOK API key, classification uses the LLM for higher accuracy
- [ ] Classification engine indicator visible before any classify action (regex vs. LLM + provider)
- [ ] Extension reads native Chrome bookmarks as the **live source of truth** — no parallel silo. The native bookmark tree is read-only from Deepmarks' perspective; only explicit user bookmark create/edit/delete actions (if and when built) may write to native bookmarks. **Classification metadata (categories, tags) is stored in IndexedDB only and is never written back to native bookmark titles.**
- [ ] Zero network requests in regex/local mode (verifiable via DevTools → Network)
- [ ] User can export a JSON/markdown bundle for use by AI agents (no daemon required)
- [ ] User can install the companion daemon and query bookmarks via MCP from Claude Code / Codex
- [ ] Open source, MIT licensed

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Extension framework | **WXT 0.19+** | MV3-native, HMR, TypeScript-first, multi-target (Chrome/Firefox) |
| UI | **React 19 + Tailwind CSS v4** | Fast, composable, familiar |
| Language | **TypeScript 5.x** (`strict: true`) | Safety, IDE support |
| Full-text search | **FlexSearch 0.7+** | Pure JS, no WASM, <200ms on 10k docs, works in service worker |
| AI classification — default | **Regex (built-in)** | Zero dependencies, zero network, works on first install for most categories |
| AI classification — enhanced | **BYOK: OpenAI / Anthropic / Gemini API** | Optional; user-supplied key stored in `chrome.storage.local`; available after key is stored **and** explicit user consent is given |
| Vector embeddings (future) | **transformers.js (Xenova)** | Deferred post-v1; lazy-loaded on demand, ~25MB model download |
| Storage | **IndexedDB via `idb` library** | Structured, large capacity (GBs), sync-free |
| Agent integration | **Native Messaging API + companion Node.js daemon** | Only viable MV3 approach to run a local HTTP/MCP server |
| Build | **Vite 6 (via WXT)** | Fast HMR, tree-shaking, WASM support |
| Testing (unit) | **Vitest** | Fast, collocated, native ESM |
| Testing (E2E) | **Playwright + WXT E2E** | Real browser, extension-aware |
| Package manager | **pnpm** | Workspace support, fast, disk-efficient |

---

## Commands

```bash
# Install dependencies
pnpm install

# Development (Chrome, hot reload)
pnpm dev

# Development (Firefox, hot reload)
pnpm dev:firefox

# Build for production (Chrome)
pnpm build

# Build for production (Firefox)
pnpm build:firefox

# Build + zip for Chrome Web Store submission
pnpm zip

# Build + zip for Firefox Add-ons (AMO) submission
pnpm zip:firefox

# Unit tests
pnpm test

# Unit tests with coverage report
pnpm test:coverage

# E2E tests (requires a built extension)
pnpm test:e2e

# Type check (no emit)
pnpm typecheck

# Lint
pnpm lint

# Lint + auto-fix
pnpm lint:fix

# Build companion MCP daemon (Node.js binary)
pnpm build:daemon

# Install companion daemon (registers native messaging host manifest)
pnpm install:daemon
```

---

## Project Structure

```
deepmarks/
├── src/
│   ├── entrypoints/               # WXT entry points (auto-discovered)
│   │   ├── background.ts          # Service worker: bookmark sync, index rebuild, native messaging
│   │   ├── sidepanel/             # Main UI — search, browse, classify, wiki
│   │   │   ├── index.html
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── popup/                 # Quick-info popup (shows bookmark count, status)
│   │   │   ├── index.html
│   │   │   └── App.tsx
│   │   └── options/               # Settings: AI engine, BYOK keys, categories
│   │       ├── index.html
│   │       └── App.tsx
│   ├── lib/
│   │   ├── bookmarks/
│   │   │   ├── sync.ts            # chrome.bookmarks tree → BookmarkNode[]
│   │   │   ├── watch.ts           # chrome.bookmarks.onCreated/Removed/Changed listeners
│   │   │   └── types.ts           # BookmarkNode, BookmarkFolder, BookmarkMeta
│   │   ├── search/
│   │   │   └── index.ts           # FlexSearch index builder + query wrapper
│   │   ├── classify/
│   │   │   ├── categories.ts      # Category definitions (8 built-in defaults, user-editable)
│   │   │   ├── regex.ts           # Regex classifier — default, zero deps, always works
│   │   │   ├── byok.ts            # BYOK LLM classifier — available after key stored + explicit user consent
│   │   │   └── router.ts          # classify() picks regex or byok; never throws
│   │   ├── storage/
│   │   │   ├── db.ts              # IndexedDB schema definition via `idb`
│   │   │   ├── bookmarks.ts       # Bookmark + metadata CRUD
│   │   │   └── settings.ts        # chrome.storage.sync for user preferences
│   │   ├── wiki/
│   │   │   ├── compile.ts         # Build interlinked knowledge base from bookmarks
│   │   │   └── export.ts          # Export wiki as markdown (File System Access API)
│   │   └── agent/
│   │       ├── export.ts          # Export bookmarks as JSON/markdown bundle for agents
│   │       └── native-messaging.ts # Extension side of Native Messaging protocol
│   └── components/
│       ├── SearchBar.tsx
│       ├── BookmarkList.tsx
│       ├── BookmarkCard.tsx
│       ├── ClassifyPanel.tsx          # Shows active engine badge (Regex / GPT-4o / etc.)
│       ├── CategoryFilter.tsx
│       ├── WikiView.tsx
│       └── Settings/
│           ├── BYOKInput.tsx          # Enter API key → stored in chrome.storage.local
│           ├── CategoryEditor.tsx     # Edit/add/delete categories (shipped with 8 defaults)
│           └── ClassifyEngineStatus.tsx  # Shows current engine + confidence threshold
├── daemon/                        # Companion Node.js process (separate package)
│   ├── src/
│   │   ├── index.ts               # Native messaging host entry point + MCP HTTP server
│   │   ├── mcp-tools.ts           # MCP tool implementations: search, list, get, export
│   │   └── types.ts               # Shared protocol types
│   ├── package.json
│   ├── tsconfig.json
│   └── install.sh                 # Registers native messaging host manifest (macOS/Linux/Win)
├── tests/
│   ├── unit/
│   │   ├── search.test.ts
│   │   ├── classify.test.ts
│   │   ├── storage.test.ts
│   │   └── wiki.test.ts
│   ├── e2e/
│   │   └── sidepanel.spec.ts
│   └── fixtures/
│       └── bookmarks.json         # 500-bookmark test fixture
├── wxt.config.ts
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── pnpm-workspace.yaml            # Workspace: root + daemon/
├── .eslintrc.json
├── vitest.config.ts
└── SPEC.md
```

---

## Code Style

### Conventions

- **Strict TypeScript**: `"strict": true`, `"noUncheckedIndexedAccess": true` — no `any`, use `unknown` + type guards at API boundaries
- **Named exports only** (no default exports except React components)
- **Result type** for fallible operations — return `{ ok: true; value: T } | { ok: false; error: string }` rather than throwing in library code
- **Co-located tests**: `search.ts` → `search.test.ts` in the same directory
- **No side effects at module scope** — makes tree-shaking and testing reliable
- **Lazy-load heavy dependencies** — if transformers.js is added post-v1, never import at the top level of a service worker or popup

### Example: library function style

```typescript
// src/lib/search/index.ts
import FlexSearch from 'flexsearch';
import type { BookmarkNode } from '../bookmarks/types';

export interface SearchResult {
  bookmark: BookmarkNode;
  score: number;
}

export type SearchIndex = FlexSearch.Index;

export function buildIndex(bookmarks: BookmarkNode[]): SearchIndex {
  const index = new FlexSearch.Index({ tokenize: 'forward', resolution: 9 });
  for (const bm of bookmarks) {
    index.add(bm.id, `${bm.title} ${bm.url} ${bm.meta?.tags?.join(' ') ?? ''}`);
  }
  return index;
}

export function search(
  index: SearchIndex,
  bookmarksMap: ReadonlyMap<string, BookmarkNode>,
  query: string,
  limit = 20,
): SearchResult[] {
  const ids = index.search(query, { limit }) as string[];
  return ids
    .map((id) => bookmarksMap.get(id))
    .filter((bm): bm is BookmarkNode => bm !== undefined)
    .map((bm) => ({ bookmark: bm, score: 1 }));
}
```

### Example: Result type for fallible operations

```typescript
// src/lib/classify/byok.ts
type ClassifyResult =
  | { ok: true; category: Category; confidence: number }
  | { ok: false; error: string };

export async function classifyWithBYOK(
  url: string,
  title: string,
  apiKey: string,
  engine: 'openai' | 'anthropic' | 'gemini',
): Promise<ClassifyResult> {
  try {
    // ... API call
    return { ok: true, category: 'tool', confidence: 0.92 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
```

### Classification engine selection

The classifier always falls back gracefully:

```
classify(url, title)
  ├─ if BYOK key configured → call LLM API → return { category, confidence, engine: 'openai' | ... }
  └─ else                  → run regex rules → return { category, confidence, engine: 'regex' }
```

The active engine is always shown in the UI before a classify action runs (no surprises).

### Default categories (matching fieldtheory-cli)

```
tool       → GitHub repos, CLI tools, npm packages, open-source projects
security   → CVEs, vulnerabilities, exploits, supply chain
technique  → Tutorials, demos, code patterns, "how I built X"
launch     → Product launches, announcements, "just shipped"
research   → ArXiv papers, studies, academic findings
opinion    → Takes, analysis, commentary, threads
commerce   → Products, shopping, physical goods
other      → Uncategorized / low-confidence
```

Shipped as defaults. Users can rename, delete, or add new categories from Settings → Categories.
Custom categories are stored in `chrome.storage.sync` so they sync across the user's browsers.

---

## Testing Strategy

| Level | Framework | Scope | Target coverage |
|---|---|---|---|
| Unit | Vitest | All of `src/lib/**` | 80%+ |
| Integration | Vitest + vitest-chrome | Background service worker, bookmark watch + index rebuild | Key flows |
| E2E | Playwright (WXT E2E) | Side panel search, classify, export flows | Happy paths |

### Key test scenarios

- Search index rebuilds correctly after `chrome.bookmarks.onCreated` fires
- Regex classifier correctly categorizes known URLs (GitHub → `tool`, arxiv.org → `research`, CVE page → `security`)
- BYOK classifier is used instead of regex when API key is configured in Settings
- BYOK classifier returns graceful error when API key is invalid or network is offline
- IndexedDB migration runs without data loss when schema changes
- Export produces valid JSON with all required fields
- Side panel opens, displays bookmarks, and search filters results in E2E test

### Browser API mocking

Use `vitest-chrome` (or manual `vi.mock` for `chrome.*` / `browser.*`) in unit tests.
Never rely on real browser APIs in unit tests. WXT provides a unified `browser` shim for
cross-browser compatibility; always import from `wxt/browser` not directly from `chrome`.

---

## Agent Integration Architecture

MV3 service workers cannot bind TCP ports. The solution uses Chrome's **Native Messaging API**:

```
Claude Code / Codex
        │  MCP tool call (HTTP, Authorization: Bearer <secret>)
        ▼
  127.0.0.1:6789  ←──── daemon/src/index.ts (Node.js process)
        │                    │
        │  Native Messaging  │ (stdin/stdout JSON)
        ▼                    ▼
  background.ts (service worker)  ←→  IndexedDB
```

**MCP tools exposed:**

| Tool name | Description |
|---|---|
| `search_bookmarks` | Full-text search, returns ranked list |
| `list_categories` | Distribution of bookmarks by category |
| `get_bookmark` | Fetch one bookmark by ID or URL |
| `export_wiki` | Return the full wiki as markdown string |
| `classify_bookmark` | Trigger classification for a URL — **disabled by default; only exposed when the user has enabled remote classification in Options, a BYOK key is stored, and explicit consent has been given** |

**Installation flow:**
1. User installs extension from Chrome Web Store / Firefox Add-ons (or loads unpacked)
2. User runs: `npx deepmarks-daemon install` (one-time, outside the browser)
3. Daemon registers its native messaging host manifest in the OS (macOS, Linux, Windows)
4. Extension background script connects on first use via Native Messaging
5. `install.sh` prints the full MCP config snippet — copy-paste ready, **including the `Authorization: Bearer` header**:
   ```json
   {
     "url": "http://127.0.0.1:6789",
     "headers": { "Authorization": "Bearer <secret>" }
   }
   ```
   User pastes this block into their Claude / Codex MCP config. The bearer token is mandatory; requests without it are rejected with 401 before any routing.

   > **Origin header:** browsers include `Origin: http://localhost` automatically — the daemon validates this as a second defense. Non-browser MCP clients (Claude Code CLI, Codex, scripts) do not send `Origin`; the bearer token is their sole credential and is sufficient. Missing `Origin` from a non-browser client is allowed if and only if the bearer token is present and valid.

> **Firefox note:** Firefox supports Native Messaging on macOS and Linux.
> Windows support requires Firefox 52+ with the correct manifest path under `HKCU`.

**Fallback (no daemon):** Side panel always has an "Export for Agents" button that
writes `bookmarks-export.json` and `bookmarks-wiki.md` to a user-chosen folder via
the File System Access API. No daemon needed for this path.

---

## Boundaries

### Always do
- Run `pnpm typecheck && pnpm lint && pnpm test` before committing
- Store BYOK API keys in `chrome.storage.local` only — never `localStorage`, `sessionStorage`, or any file
- Validate all data at the `chrome.bookmarks` API boundary before writing to IndexedDB
- Request only the minimum permissions needed; justify every `permissions` entry in `manifest.json`
- Show the active classification engine (regex vs. LLM provider name) before any classify action
- Default to regex classification — zero network, works on fresh install with no configuration
- Handle offline state gracefully — the extension must be fully functional with zero network
- Use WXT's `browser` shim (not raw `chrome.*`) everywhere for Firefox compatibility

### Ask first (get approval before doing)
- Adding any new `permissions` or `host_permissions` to `manifest.json`
- Adding a new npm dependency (keep bundle size < 2MB per entrypoint)
- Changing the IndexedDB schema (must include a migration path)
- Enabling any telemetry, analytics, or crash reporting — even "anonymous"
- Changing the MCP tool interface (breaks existing agent configurations)
- Adding any feature that requires a backend server or cloud service

### Never do
- Send bookmark URLs, titles, or page content to any server without explicit user consent + active BYOK key configured
- Store API keys in source code, environment variables committed to the repo, or `localStorage`
- Auto-classify bookmarks without a user-triggered action (respect consent)
- Import the full `transformers.js` library at module load time — always lazy-load
- Use `eval()`, `new Function()`, or `innerHTML =` (CSP violation + XSS risk)
- Commit secrets, personal browsing data, or PII to the repository
- Remove or skip failing tests instead of fixing the underlying issue

---

## Success Criteria

1. **Search speed**: 1,000 bookmarks searchable in < 200ms from side panel open (measured via `performance.now()`)
2. **Classification accuracy**: Regex classifier correctly categorizes ≥ 80% of a 50-URL test fixture; BYOK mode ≥ 90%
3. **Local-first**: Zero outbound network requests in regex mode (verified in Chrome DevTools → Network tab with "No throttling")
4. **Native bookmark integration**: The extension reads native Chrome and Firefox bookmarks as the **live source of truth**. The native bookmark tree is read-only from Deepmarks' perspective. Only explicit user-initiated bookmark create/edit/delete actions, if built, may write to native bookmarks. Classification metadata (categories, tags) is stored in IndexedDB only — Chrome's native bookmark manager titles are never modified (resolved decision Q2)
5. **Agent integration**: `search_bookmarks` MCP tool returns correct results from Claude Code REPL after daemon install
6. **Wiki export**: Classifying 50+ bookmarks and running "Export Wiki" produces a valid markdown file with inter-links
7. **Bundle size**: Each entrypoint < 2MB (without transformers.js model weights, which load on demand)
8. **Privacy audit**: No PII visible in any outgoing request in Burp Suite / Charles Proxy during normal use

---

## Resolved Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Project name | **Deepmarks** |
| 2 | Local model (transformers.js) | Deferred post-v1 — regex default + BYOK covers v1 needs without 25MB download |
| 3 | Agent integration scope | **Full MCP daemon in v1** — target users are developers, acceptable complexity |
| 4 | Browser targets | **Chrome + Firefox from day 1** via WXT's unified `browser` shim |
| 5 | Custom categories | **8 default categories shipped**; user can rename/add/delete from Settings |
| 6 | Bookmark metadata storage | Category tags in IndexedDB (not `chrome.sync`) — acceptable; document the tradeoff in README |

---

## Assumptions

1. Target browsers are Chrome / Chromium (MV3) and Firefox (MV3 via WXT).
2. v1 is a solo or small-team open-source project — no backend, no accounts, no monetization complexity.
3. The companion daemon targets developers; non-developer users still get full value from the extension + export fallback.
4. No local ML model in v1 — regex is default, BYOK is the opt-in upgrade.
5. The extension uses the native bookmark tree as source of truth; Deepmarks metadata (categories, summaries) lives in IndexedDB and is extension-local (not synced between browsers via `chrome.sync`).
6. The daemon is distributed as an npm package (`npx deepmarks-daemon install`) — no binary download required.
