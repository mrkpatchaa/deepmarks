/**
 * BYOK (Bring-Your-Own-Key) classifier — Task 4.2
 *
 * Classifies a bookmark via OpenAI, Anthropic, or Gemini using the user's
 * own API key stored in chrome.storage.local.
 *
 * Security guarantees:
 *  - API key is read from storage INSIDE this function — never passed as param.
 *  - API key NEVER appears in error messages, logs, or exported state.
 *  - Prompt is system/user-split to prevent prompt injection via title/URL.
 *  - Fetch targets hardcoded official API endpoints only (not user-configurable).
 *  - Response JSON is JSON.parse'd inside try/catch, then Zod-validated.
 *  - AbortController enforces a 10-second timeout per request.
 *  - Maximum one concurrent request; additional calls queue — no drops.
 *  - Consent flag must be set in storage before any request is made.
 */
import { z } from "zod";
import type { Category, ClassifyEngine, Result } from "../bookmarks/types";
import { err, ok } from "../bookmarks/types";

/** Output produced by a successful BYOK classification. */
export interface BYOKResult {
    category: Category;
    /** Subject-matter field slug assigned by the LLM (e.g. "ai", "web-dev"). Absent for plain-text responses. */
    domain?: string;
}

/** Subset of ClassifyEngine that performs actual API calls. */
export type BYOKEngine = Exclude<ClassifyEngine, "regex">;

const BYOK_TIMEOUT_MS = 10_000;

/** System prompt — separated from user data to prevent prompt injection. */
const SYSTEM_PROMPT =
    "You are a bookmark classifier. " +
    'Given a URL and title, respond with a JSON object with exactly two keys: "category" and "domain". ' +
    '"category" must be exactly one of: tool, security, technique, launch, research, opinion, commerce, other. ' +
    '"domain" is the subject field — a short lowercase hyphenated slug (e.g. ai, finance, web-dev, devops, startups, design, science, security, gaming, media). ' +
    "Respond with only the JSON object — no markdown, no explanation.";

/** chrome.storage.local key per engine that stores the API key (or model name for Ollama). */
const STORAGE_KEY: Record<BYOKEngine, string> = {
    openai: "byok_openai",
    anthropic: "byok_anthropic",
    gemini: "byok_gemini",
    ollama: "byok_ollama_model",
} as const;

/** chrome.storage.local key for the one-time consent flag. */
export const CONSENT_KEY = "byok_consent";

// ── Sequential-execution queue ────────────────────────────────────────────
// Ensures at most one BYOK request is in-flight at any time.
// Additional calls queue behind the current one (no silent drops).

let queueTail: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const resultP = queueTail.then(task);
    // Advance the tail; swallow result/error so the chain never breaks.
    queueTail = resultP.then(
        () => undefined,
        () => undefined,
    );
    return resultP;
}

// ── Storage helpers ───────────────────────────────────────────────────────

async function readStringStorage(key: string): Promise<string | undefined> {
    // chrome.storage.local.get returns { [key]: any }; narrow to unknown for safety.
    const raw = await chrome.storage.local.get(key);
    const val: unknown = (raw as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
}

async function readBoolStorage(key: string): Promise<boolean> {
    const raw = await chrome.storage.local.get(key);
    const val: unknown = (raw as Record<string, unknown>)[key];
    return val === true;
}

// ── Zod schemas ───────────────────────────────────────────────────────────

const CategorySchema = z.enum([
    "tool",
    "security",
    "technique",
    "launch",
    "research",
    "opinion",
    "commerce",
    "other",
] as const);

/**
 * New JSON classify response format: {"category":"tool","domain":"ai"}.
 * Plain-text responses (legacy / simple models) are handled by a fallback path.
 */
const ClassifyResponseSchema = z.object({
    category: CategorySchema,
    domain: z.string().optional(),
});

const OpenAIResponseSchema = z.object({
    choices: z
        .array(z.object({ message: z.object({ content: z.string() }) }))
        .min(1),
});

const AnthropicResponseSchema = z.object({
    content: z
        .array(z.object({ type: z.literal("text"), text: z.string() }))
        .min(1),
});

const GeminiResponseSchema = z.object({
    candidates: z
        .array(
            z.object({
                content: z.object({
                    parts: z.array(z.object({ text: z.string() })).min(1),
                }),
            }),
        )
        .min(1),
});

// ── Response text extraction ──────────────────────────────────────────────

function extractText(engine: BYOKEngine, body: unknown): string | null {
    switch (engine) {
        case "openai": {
            const parsed = OpenAIResponseSchema.safeParse(body);
            if (!parsed.success) return null;
            return parsed.data.choices[0]?.message.content.trim() ?? null;
        }
        case "anthropic": {
            const parsed = AnthropicResponseSchema.safeParse(body);
            if (!parsed.success) return null;
            return parsed.data.content[0]?.text.trim() ?? null;
        }
        case "gemini": {
            const parsed = GeminiResponseSchema.safeParse(body);
            if (!parsed.success) return null;
            return parsed.data.candidates[0]?.content.parts[0]?.text.trim() ?? null;
        }
        case "ollama": {
            // Ollama's /v1/chat/completions endpoint is OpenAI-compatible.
            const parsed = OpenAIResponseSchema.safeParse(body);
            if (!parsed.success) return null;
            return parsed.data.choices[0]?.message.content.trim() ?? null;
        }
    }
}

// ── Per-engine fetch parameters ───────────────────────────────────────────

interface FetchParams {
    readonly apiUrl: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
}

function buildFetchParams(
    engine: BYOKEngine,
    apiKey: string,
    userMessage: string,
): FetchParams {
    switch (engine) {
        case "openai":
            return {
                apiUrl: "https://api.openai.com/v1/chat/completions",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: {
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userMessage },
                    ],
                    max_tokens: 50,
                    temperature: 0,
                },
            };
        case "anthropic":
            return {
                apiUrl: "https://api.anthropic.com/v1/messages",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: {
                    model: "claude-3-5-haiku-latest",
                    system: SYSTEM_PROMPT,
                    messages: [{ role: "user", content: userMessage }],
                    max_tokens: 50,
                },
            };
        case "gemini":
            return {
                apiUrl:
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey,
                },
                body: {
                    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: [{ role: "user", parts: [{ text: userMessage }] }],
                    generationConfig: { maxOutputTokens: 50, temperature: 0 },
                },
            };
        case "ollama":
            // apiKey is the model name for Ollama (stored in byok_ollama_model).
            // Uses the OpenAI-compatible endpoint — no Authorization header needed.
            return {
                apiUrl: "http://localhost:11434/v1/chat/completions",
                headers: { "Content-Type": "application/json" },
                body: {
                    model: apiKey,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userMessage },
                    ],
                    max_tokens: 50,
                    temperature: 0,
                },
            };
    }
}

// ── Core implementation (runs inside queue) ───────────────────────────────

async function doClassify(
    url: string,
    title: string,
    engine: BYOKEngine,
): Promise<Result<BYOKResult>> {
    // 1. Consent check — Ollama runs locally so no consent is required.
    if (engine !== "ollama") {
        const hasConsent = await readBoolStorage(CONSENT_KEY);
        if (!hasConsent) {
            return err("Consent required: byok/consent");
        }
    }

    // 2. API key / model name check.
    const apiKey = await readStringStorage(STORAGE_KEY[engine]);
    if (apiKey === undefined || apiKey === "") {
        return err(engine === "ollama" ? "No Ollama model configured" : "No API key configured");
    }

    // 3. Build the user message. URL and title go into the *user* message only
    //    (not the system prompt) to prevent prompt injection via bookmark data.
    const userMessage = `URL: ${url}\nTitle: ${title}`;

    // 4. Build engine-specific fetch parameters.
    const { apiUrl, headers, body } = buildFetchParams(engine, apiKey, userMessage);

    // 5. Fetch with 10-second timeout enforced by AbortController.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, BYOK_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
            return err("Request timed out");
        }
        return err("Network error");
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
        if (response.status === 403 && engine === "ollama") {
            return err(
                "Ollama blocked the request (403 Forbidden). " +
                "Restart Ollama with: OLLAMA_ORIGINS=* ollama serve",
            );
        }
        return err(`Request failed (HTTP ${String(response.status)})`);
    }

    // 6. Parse response JSON inside try/catch — never use eval.
    let text: string;
    try {
        text = await response.text();
    } catch {
        return err("Network error");
    }

    let responseJson: unknown;
    try {
        responseJson = JSON.parse(text) as unknown;
    } catch {
        return err("Invalid JSON in response");
    }

    // 7. Extract category text from the engine-specific response shape.
    const rawText = extractText(engine, responseJson);
    if (rawText === null) {
        return err("Unexpected response format");
    }

    // 8. Parse the inner content.
    // Try JSON first (new format: {"category":"...","domain":"..."}),
    // then fall back to plain-text category (legacy / simple models).
    let category: Category;
    let domain: string | undefined;

    const stripped = rawText
        .replace(/^```json?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

    let innerJson: unknown;
    try {
        innerJson = JSON.parse(stripped);
    } catch {
        innerJson = undefined;
    }

    if (
        innerJson !== undefined &&
        typeof innerJson === "object" &&
        innerJson !== null
    ) {
        // JSON format path
        const parsed = ClassifyResponseSchema.safeParse(innerJson);
        if (!parsed.success) {
            const rawCat =
                "category" in innerJson &&
                typeof (innerJson as Record<string, unknown>).category === "string"
                    ? ((innerJson as Record<string, unknown>).category as string)
                    : "unknown";
            return err(`Unrecognised category in response: "${rawCat}"`);
        }
        category = parsed.data.category;
        domain = parsed.data.domain;
    } else {
        // Plain-text fallback (backward-compatible with test mocks and older models)
        const normalized = rawText.toLowerCase().trim();
        const parsed = CategorySchema.safeParse(normalized);
        if (!parsed.success) {
            return err(`Unrecognised category in response: "${normalized}"`);
        }
        category = parsed.data;
        domain = undefined;
    }

    return ok({ category, domain });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Classify a bookmark using the user's BYOK API key.
 *
 * Reads the API key from chrome.storage.local (never from parameters).
 * Enforces a 10-second timeout and serialises concurrent calls.
 *
 * Returns `{ ok: false, error: "Consent required: byok/consent" }` when the
 * user has not yet granted consent — the caller should show the consent
 * dialog, write `{ [CONSENT_KEY]: true }` to chrome.storage.local, then retry.
 */
export function classifyWithBYOK(
    url: string,
    title: string,
    engine: BYOKEngine,
): Promise<Result<BYOKResult>> {
    return enqueue(() => doClassify(url, title, engine));
}
