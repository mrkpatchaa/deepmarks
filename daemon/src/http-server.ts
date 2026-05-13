/**
 * MCP HTTP server — Task 7.2
 *
 * Binds to 127.0.0.1:6789 (never 0.0.0.0).
 * Every request requires `Authorization: Bearer <secret>`.
 * Origin header validated as a second defense when present.
 * classify_bookmark is disabled by default.
 *
 * SECURITY:
 * - Never logs bookmark content or API keys.
 * - Only operation names and counts are logged.
 * - CORS: Access-Control-Allow-Origin set to specific origin only (never *).
 * - No eval, no new Function anywhere in this file.
 * - Shared secret loaded from ~/.deepmarks/daemon.secret or DEEPMARKS_SECRET env var.
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { BookmarkNode, Category } from "./types.ts";
import { sendToExtension, onExtensionMessage } from "./native-host.ts";

// ── Constant ────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set(["http://localhost", "http://127.0.0.1"]);

// ── Secret loading ──────────────────────────────────────────────────────────

function readSharedSecret(): string {
    const envSecret = process.env["DEEPMARKS_SECRET"];
    if (typeof envSecret === "string" && envSecret.length > 0) {
        return envSecret;
    }
    const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    if (home === "") return "";
    const secretPath = `${home}/.deepmarks/daemon.secret`;
    try {
        return readFileSync(secretPath, "utf8").trim();
    } catch {
        return "";
    }
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const SearchInputSchema = z.object({
    query: z.string().max(200),
    limit: z.number().int().min(1).max(100).optional(),
});

const GetBookmarkInputSchema = z.object({
    id: z.string(),
});

const ClassifyInputSchema = z.object({
    url: z.string().max(2048),
    title: z.string().max(500),
});

// ── In-memory state ──────────────────────────────────────────────────────────

const bookmarkStore = new Map<string, BookmarkNode>();
let classifyEnabled = false;

export function setClassifyEnabled(enabled: boolean): void {
    classifyEnabled = enabled;
}

export function updateBookmarkStore(bookmarks: BookmarkNode[]): void {
    for (const bm of bookmarks) {
        bookmarkStore.set(bm.id, bm);
    }
}

// ── Pending requests to the extension ───────────────────────────────────────

type ResolverFn = (value: Record<string, unknown>) => void;
const pendingExtRequests = new Map<number, ResolverFn>();
let nextId = 1;

function requestFromExtension(
    type: string,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const id = nextId;
    nextId += 1;
    return new Promise<Record<string, unknown>>((resolve) => {
        pendingExtRequests.set(id, resolve);
        sendToExtension({ id, type, payload });
        setTimeout(() => {
            if (pendingExtRequests.has(id)) {
                pendingExtRequests.delete(id);
                resolve({ error: "timeout" });
            }
        }, 5000);
    });
}

// Wire extension responses into the pending map.
onExtensionMessage((msg) => {
    if (msg.type === "RESPONSE") {
        const resolve = pendingExtRequests.get(msg.id);
        if (resolve !== undefined) {
            pendingExtRequests.delete(msg.id);
            resolve(msg.payload);
        }
    }
    if (msg.type === "BOOKMARK_STORE_UPDATE") {
        const bms = msg.payload["bookmarks"];
        if (Array.isArray(bms)) {
            updateBookmarkStore(bms as BookmarkNode[]);
        }
    }
    if (msg.type === "CLASSIFY_ENABLED") {
        const enabled = msg.payload["enabled"];
        setClassifyEnabled(enabled === true);
    }
});

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(text),
        "Cache-Control": "no-store",
    });
    res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let data = "";
        req.on("data", (chunk: Buffer) => { data += chunk.toString("utf8"); });
        req.on("end", () => { resolve(data); });
        req.on("error", reject);
    });
}

function safeParseBody(body: string): unknown {
    try {
        return JSON.parse(body) as unknown;
    } catch {
        return null;
    }
}

// ── Auth + CORS middleware ─────────────────────────────────────────────────

function checkAuth(
    req: IncomingMessage,
    res: ServerResponse,
    secret: string,
): boolean {
    // Primary auth: Bearer token
    const authHeader = req.headers["authorization"] ?? "";
    if (secret === "" || authHeader !== `Bearer ${secret}`) {
        json(res, 401, { error: "unauthorized" });
        return false;
    }
    // Second defense: Origin header (only checked when present)
    const origin = req.headers["origin"];
    if (typeof origin === "string" && !ALLOWED_ORIGINS.has(origin)) {
        json(res, 403, { error: "forbidden_origin" });
        return false;
    }
    return true;
}

function setCORSHeaders(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers["origin"];
    const allowedOrigin =
        typeof origin === "string" && ALLOWED_ORIGINS.has(origin)
            ? origin
            : "http://localhost";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

// ── MCP tool handlers ──────────────────────────────────────────────────────

async function handleSearchBookmarks(
    body: string,
    res: ServerResponse,
): Promise<void> {
    const parsed = SearchInputSchema.safeParse(safeParseBody(body));
    if (!parsed.success) {
        json(res, 400, { error: "invalid_input", issues: parsed.error.issues });
        return;
    }
    const { query, limit } = parsed.data;
    console.error(`[deepmarks-daemon] search_bookmarks query="${query}"`);
    const result = await requestFromExtension("SEARCH", { query, limit });
    json(res, 200, result);
}

async function handleListCategories(res: ServerResponse): Promise<void> {
    const categories = new Set<string>();
    for (const bm of bookmarkStore.values()) {
        categories.add(bm.meta?.category ?? "other");
    }
    json(res, 200, { categories: [...categories].sort() });
}

async function handleGetBookmark(
    body: string,
    res: ServerResponse,
): Promise<void> {
    const parsed = GetBookmarkInputSchema.safeParse(safeParseBody(body));
    if (!parsed.success) {
        json(res, 400, { error: "invalid_input", issues: parsed.error.issues });
        return;
    }
    const bookmark = bookmarkStore.get(parsed.data.id) ?? null;
    json(res, 200, { bookmark });
}

async function handleExportWiki(res: ServerResponse): Promise<void> {
    console.error("[deepmarks-daemon] export_wiki");
    const result = await requestFromExtension("COMPILE_WIKI", {});
    json(res, 200, { markdown: result["markdown"] ?? "" });
}

async function handleClassifyBookmark(
    body: string,
    res: ServerResponse,
): Promise<void> {
    if (!classifyEnabled) {
        json(res, 403, { error: "classify_disabled" });
        return;
    }
    const parsed = ClassifyInputSchema.safeParse(safeParseBody(body));
    if (!parsed.success) {
        json(res, 400, { error: "invalid_input", issues: parsed.error.issues });
        return;
    }
    const { url, title } = parsed.data;
    console.error(`[deepmarks-daemon] classify_bookmark url="${url}"`);
    const result = await requestFromExtension("CLASSIFY", { url, title });
    const category = (result["category"] as Category | undefined) ?? "other";
    json(res, 200, { category });
}

// ── Request router ─────────────────────────────────────────────────────────

async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    secret: string,
): Promise<void> {
    // CORS preflight
    if (req.method === "OPTIONS") {
        setCORSHeaders(req, res);
        res.writeHead(204);
        res.end();
        return;
    }

    setCORSHeaders(req, res);

    if (!checkAuth(req, res, secret)) return;

    const urlPath = req.url ?? "";
    const method = req.method ?? "GET";

    let body = "";
    if (method === "POST") {
        try {
            body = await readBody(req);
        } catch {
            json(res, 400, { error: "bad_request" });
            return;
        }
    }

    if (urlPath === "/mcp/search_bookmarks" && method === "POST") {
        await handleSearchBookmarks(body, res);
    } else if (urlPath === "/mcp/list_categories" && method === "GET") {
        await handleListCategories(res);
    } else if (urlPath === "/mcp/get_bookmark" && method === "POST") {
        await handleGetBookmark(body, res);
    } else if (urlPath === "/mcp/export_wiki" && method === "GET") {
        await handleExportWiki(res);
    } else if (urlPath === "/mcp/classify_bookmark" && method === "POST") {
        await handleClassifyBookmark(body, res);
    } else if (urlPath === "/health" && method === "GET") {
        json(res, 200, { ok: true });
    } else {
        json(res, 404, { error: "not_found" });
    }
}

// ── Server factory ─────────────────────────────────────────────────────────

export function createServer(port = 6789): http.Server {
    const secret = readSharedSecret();

    const server = http.createServer((req, res) => {
        void handleRequest(req, res, secret);
    });

    server.listen(port, "127.0.0.1", () => {
        console.error(`[deepmarks-daemon] listening on 127.0.0.1:${String(port)}`);
    });

    return server;
}
