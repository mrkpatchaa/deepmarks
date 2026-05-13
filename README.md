# Deepmarks

**Local-first AI bookmark manager** — search, classify, and query your bookmarks with AI. Zero data leaves your machine.

## Features

- **Full-text search** across all Chrome bookmarks via FlexSearch (< 200ms on 10,000 bookmarks)
- **Automatic classification** into 8 categories using offline regex rules or BYOK LLM (OpenAI / Anthropic / Gemini)
- **Wiki export** — generate a structured Markdown wiki from your bookmarks for use in AI context windows
- **Agent integration** — companion MCP daemon lets Claude Code, Codex, and other agents query your bookmarks directly
- **Zero network** in regex mode — not a single request leaves the browser

## Privacy Guarantees

| Mode | Outbound requests |
|------|-------------------|
| Regex classification (default) | None |
| BYOK LLM classification | One request to your chosen AI provider only |
| Agent daemon | Loopback only (127.0.0.1:6789) |

No bookmark data, API keys, or usage telemetry is ever sent to Deepmarks servers (there are none).

## Bundle Sizes

| Entrypoint | Size |
|------------|------|
| background.js | 129.6 kB |
| sidepanel (chunk) | 146.9 kB |
| jsx-runtime (chunk) | 191.0 kB |
| byok (chunk) | 60.5 kB |
| **Total** | **567 kB** |

Daemon bundle: 324 kB (Node.js CJS, includes zod).

## Security

- **Manifest permissions**: `bookmarks`, `storage`, `sidePanel`, `nativeMessaging` only — no `tabs`, no `host_permissions`
- **CSP**: `script-src 'self'; object-src 'none'`
- **No innerHTML / dangerouslySetInnerHTML** anywhere in the codebase
- **All URLs** validated against `^https?://` before rendering
- **Daemon**: binds `127.0.0.1` only; `Authorization: Bearer <secret>` required on every request; shared secret stored at `~/.deepmarks/daemon.secret` with `0600` permissions
- **BYOK keys**: stored in `chrome.storage.local` only, never logged or synced
- **classify_bookmark** MCP tool: disabled by default, only exposed when user has opted in and a BYOK key is present

## Installation

### Extension

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked" → select `.output/chrome-mv3`
4. Note your Extension ID from the extensions page

### Companion Daemon (optional, for AI agent integration)

```bash
cd daemon
pnpm install && pnpm build
bash install.sh
```

The installer:
- Generates a 32-byte random shared secret at `~/.deepmarks/daemon.secret`
- Registers the Native Messaging host manifest for Chrome (and Firefox if installed)
- Prints the MCP config snippet to add to Claude / Codex

After running, edit `~/.deepmarks/com.deepmarks.daemon.json` and replace `REPLACE_WITH_YOUR_EXTENSION_ID` with your actual extension ID from `chrome://extensions`.

## Development

```bash
pnpm install
pnpm dev          # WXT dev server with HMR
pnpm typecheck    # TypeScript strict check
pnpm lint         # ESLint (strictTypeChecked)
pnpm test         # Vitest (167 unit tests)
pnpm build        # Production bundle
pnpm zip          # Chrome .zip for submission
```

### Daemon development

```bash
cd daemon
pnpm typecheck    # tsc --noEmit
pnpm build        # esbuild → dist/index.cjs
```

## Architecture

```
src/
  entrypoints/
    background.ts       # Service worker: bookmark sync, search index, native messaging
    sidepanel/          # Main UI: browse, search, classify, wiki, export
    popup/              # Mini popup: counts + quick links
    options/            # Settings: BYOK keys, categories, engine status
  lib/
    bookmarks/          # types, sync, url validation
    storage/            # IndexedDB (idb), chrome.storage settings
    search/             # FlexSearch wrapper
    classify/           # Regex engine, BYOK router, categories
    wiki/               # Markdown compiler, file export
    agent/              # Native Messaging bridge, JSON export
  components/           # React UI components (all pure, no network)

daemon/
  src/
    types.ts            # Shared types (BookmarkNode, MCP interfaces)
    native-host.ts      # Chrome Native Messaging framing (4-byte LE length prefix)
    http-server.ts      # HTTP MCP server (127.0.0.1:6789)
    index.ts            # Entry point
  install.sh            # Idempotent installer (macOS / Linux / Windows)
```

## MCP Tools

The companion daemon exposes these tools to AI agents:

| Tool | Description |
|------|-------------|
| `search_bookmarks` | Full-text search with optional category filter |
| `list_categories` | List all categories with counts |
| `get_bookmark` | Get a single bookmark by ID |
| `export_wiki` | Get the full Markdown wiki |
| `classify_bookmark` | Classify a URL (requires BYOK opt-in) |

## Tests

```
Test Files  11 passed (11)
     Tests  167 passed (167)

Coverage (src/lib/**):
  Statements: 86.66%  ✓
  Functions:  86.48%  ✓
  Lines:      88.64%  ✓
  Branches:   71.42%  (threshold: 70%)  ✓
```
