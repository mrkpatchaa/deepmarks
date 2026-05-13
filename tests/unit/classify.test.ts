/**
 * Tests for the regex classifier (Task 4.1), BYOK classifier (Task 4.2),
 * and classify router (Task 4.3).
 *
 * Regex covers:
 *  1. Spec-required mappings (github.com→tool, arxiv.org→research, etc.)
 *  2. 50-URL fixture with ≥ 80% accuracy assertion
 *  3. Edge cases (invalid URL, empty strings, fallback to "other")
 *
 * BYOK covers:
 *  4. Consent gate — no request without consent
 *  5. Missing API key — graceful error
 *  6. Valid OpenAI / Anthropic / Gemini responses → correct category
 *  7. HTTP error / invalid JSON / unrecognised category → graceful errors
 *  8. AbortError (timeout) + network error → graceful errors
 *  9. Concurrent calls are queued, not dropped
 *
 * Router covers:
 * 10. BYOK available + succeeds → uses BYOK engine
 * 11. BYOK configured + BYOK fails → falls back to regex (never errors)
 * 12. BYOK not configured (no consent) → uses regex
 * 13. getActiveEngine returns BYOK engine when configured, regex otherwise
 * 14. classify() always returns ok Result
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Category } from "../../src/lib/bookmarks/types";
import { classifyByRegex } from "../../src/lib/classify/regex";
import { ALL_CATEGORIES } from "../../src/lib/classify/categories";
import { classifyWithBYOK, CONSENT_KEY } from "../../src/lib/classify/byok";
import { classify, getActiveEngine } from "../../src/lib/classify/router";
import "fake-indexeddb/auto";
import { closeDb, clearAllBookmarks, upsertBookmark } from "../../src/lib/storage/db";
import type { BookmarkNode } from "../../src/lib/bookmarks/types";

// ── 50-URL classification fixture ─────────────────────────────────────────

interface FixtureEntry {
  url: string;
  title: string;
  expected: Category;
}

const FIXTURE: readonly FixtureEntry[] = [
  // ── tool (12) ─────────────────────────────────────────────────────────────
  {
    url: "https://github.com/facebook/react",
    title: "React – A JavaScript library for building user interfaces",
    expected: "tool",
  },
  {
    url: "https://npmjs.com/package/lodash",
    title: "lodash | npm",
    expected: "tool",
  },
  {
    url: "https://hub.docker.com/_/postgres",
    title: "postgres - Official Image | Docker Hub",
    expected: "tool",
  },
  {
    url: "https://vercel.com/docs/concepts/deployments",
    title: "Deployment Overview – Vercel Docs",
    expected: "tool",
  },
  {
    url: "https://github.com/denoland/deno",
    title: "denoland/deno: A modern runtime for JavaScript and TypeScript",
    expected: "tool",
  },
  {
    url: "https://pypi.org/project/requests/",
    title: "requests · PyPI",
    expected: "tool",
  },
  {
    url: "https://grafana.com/grafana/dashboards",
    title: "Grafana Dashboards",
    expected: "tool",
  },
  {
    url: "https://sentry.io/welcome/",
    title: "Sentry | Application Monitoring and Error Tracking",
    expected: "tool",
  },
  {
    url: "https://supabase.com/docs/guides/database",
    title: "Database | Supabase Docs",
    expected: "tool",
  },
  {
    url: "https://cloudflare.com/developer-platform/workers",
    title: "Cloudflare Workers – Serverless Functions",
    expected: "tool",
  },
  {
    url: "https://linear.app/features",
    title: "Linear – The Issue Tracker Built for Modern Software Teams",
    expected: "tool",
  },
  {
    url: "https://gitlab.com/gitlab-org/gitlab",
    title: "GitLab.org / GitLab · GitLab",
    expected: "tool",
  },

  // ── security (8) ──────────────────────────────────────────────────────────
  {
    url: "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-21413",
    title: "CVE-2024-21413 Microsoft Outlook Remote Code Execution",
    expected: "security",
  },
  {
    url: "https://nvd.nist.gov/vuln/detail/CVE-2023-44487",
    title: "NVD - CVE-2023-44487 (HTTP/2 Rapid Reset Attack)",
    expected: "security",
  },
  {
    url: "https://owasp.org/www-project-top-ten/",
    title: "OWASP Top Ten Web Application Security Risks",
    expected: "security",
  },
  {
    url: "https://portswigger.net/web-security/sql-injection",
    title: "SQL injection | Web Security Academy – PortSwigger",
    expected: "security",
  },
  {
    url: "https://hackerone.com/reports/1234567",
    title: "HackerOne Report: SSRF bypass via URL redirection",
    expected: "security",
  },
  {
    url: "https://exploit-db.com/exploits/51337",
    title: "Exploit Database – Verified exploits",
    expected: "security",
  },
  {
    url: "https://snyk.io/learn/xss/",
    title: "Cross-Site Scripting (XSS) | Snyk Learn",
    expected: "security",
  },
  {
    url: "https://bleepingcomputer.com/news/security/new-attack-technique",
    title: "New Attack Technique Uses CSS to Track Users Across Sites",
    expected: "security",
  },

  // ── technique (10) ────────────────────────────────────────────────────────
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    title: "JavaScript Guide - MDN Web Docs",
    expected: "technique",
  },
  {
    url: "https://tailwindcss.com/docs/installation",
    title: "Installation - Tailwind CSS",
    expected: "technique",
  },
  {
    url: "https://react.dev/learn/thinking-in-react",
    title: "Thinking in React – React",
    expected: "technique",
  },
  {
    url: "https://web.dev/articles/cls",
    title: "Cumulative Layout Shift (CLS) – web.dev",
    expected: "technique",
  },
  {
    url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/",
    title: "A Complete Guide to Flexbox | CSS-Tricks",
    expected: "technique",
  },
  {
    url: "https://docs.python.org/3/library/asyncio.html",
    title: "asyncio — Asynchronous I/O — Python 3.12 documentation",
    expected: "technique",
  },
  {
    url: "https://typescriptlang.org/docs/handbook/generics.html",
    title: "TypeScript: Documentation - Generics",
    expected: "technique",
  },
  {
    url: "https://freecodecamp.org/news/learn-react-hooks/",
    title: "Learn React Hooks – Complete Tutorial",
    expected: "technique",
  },
  {
    url: "https://roadmap.sh/frontend",
    title: "Frontend Developer Roadmap – roadmap.sh",
    expected: "technique",
  },
  {
    url: "https://refactoring.guru/design-patterns/factory-method",
    title: "Factory Method – Refactoring.Guru",
    expected: "technique",
  },

  // ── launch (5) ────────────────────────────────────────────────────────────
  {
    url: "https://producthunt.com/posts/cursor-ai",
    title: "Cursor AI – The AI-first code editor | Product Hunt",
    expected: "launch",
  },
  {
    url: "https://betalist.com/startups/deepmarks",
    title: "Deepmarks – AI-Enhanced Bookmark Manager | BetaList",
    expected: "launch",
  },
  {
    url: "https://appsumo.com/products/notion",
    title: "Notion Lifetime Deal | AppSumo",
    expected: "launch",
  },
  {
    url: "https://kickstarter.com/projects/creator/smart-mechanical-keyboard",
    title: "Smart Mechanical Keyboard Project | Kickstarter",
    expected: "launch",
  },
  {
    url: "https://news.ycombinator.com/item?id=39857510",
    title: "Show HN: I built a local-first bookmark manager with AI classify",
    expected: "launch",
  },

  // ── research (7) ──────────────────────────────────────────────────────────
  {
    url: "https://arxiv.org/abs/2402.17764",
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    expected: "research",
  },
  {
    url: "https://scholar.google.com/scholar?q=transformer+attention",
    title: "transformer attention – Google Scholar",
    expected: "research",
  },
  {
    url: "https://pubmed.ncbi.nlm.nih.gov/36764151/",
    title: "CRISPR-Cas9 gene editing therapeutic potential – PubMed",
    expected: "research",
  },
  {
    url: "https://ieeexplore.ieee.org/document/9879865",
    title: "A Survey on Deep Learning for Natural Language Processing – IEEE Xplore",
    expected: "research",
  },
  {
    url: "https://semanticscholar.org/paper/Attention-Is-All-You-Need-Vaswani/204e3073",
    title: "Attention Is All You Need – Semantic Scholar",
    expected: "research",
  },
  {
    url: "https://dl.acm.org/doi/10.1145/3597503.3639138",
    title: "On the Naturalness of Software – ACM Digital Library",
    expected: "research",
  },
  {
    url: "https://openreview.net/forum?id=YTWGvpFIa9",
    title: "Scaling Laws for Neural Language Models – OpenReview",
    expected: "research",
  },

  // ── opinion (4) ───────────────────────────────────────────────────────────
  {
    url: "https://substack.com/home/post/p-future-of-ai",
    title: "The future of AI in 2025 | Substack",
    expected: "opinion",
  },
  {
    url: "https://paulgraham.com/articles.html",
    title: "Paul Graham: Essays",
    expected: "opinion",
  },
  {
    url: "https://stratechery.com/2024/ai-strategy/",
    title: "AI Strategy – Stratechery by Ben Thompson",
    expected: "opinion",
  },
  {
    url: "https://danluu.com/programmer-moneymaking/",
    title: "Programmer moneymaking – Dan Luu",
    expected: "opinion",
  },

  // ── commerce (4) ──────────────────────────────────────────────────────────
  {
    url: "https://amazon.com/dp/B09G9FPHY6",
    title: "Apple AirPods Pro (2nd generation) | Amazon",
    expected: "commerce",
  },
  {
    url: "https://etsy.com/listing/123456/handmade-leather-wallet",
    title: "Handmade Leather Wallet – Etsy",
    expected: "commerce",
  },
  {
    url: "https://ebay.com/itm/mechanical-keyboard/234567",
    title: "Mechanical Keyboard – eBay",
    expected: "commerce",
  },
  {
    url: "https://bestbuy.com/site/laptop/all-laptops/pcmcat138500050001.c",
    title: "All Laptops | Best Buy",
    expected: "commerce",
  },
] as const;

// ── Spec-required explicit mappings ───────────────────────────────────────

describe("classifyByRegex — spec-required mappings", () => {
  it("classifies github.com URLs as tool", () => {
    expect(classifyByRegex("https://github.com/microsoft/typescript", "TypeScript")).toBe("tool");
    expect(classifyByRegex("https://github.com/facebook/react", "React")).toBe("tool");
  });

  it("classifies arxiv.org URLs as research", () => {
    expect(classifyByRegex("https://arxiv.org/abs/2305.10601", "Let's Verify Step by Step")).toBe(
      "research",
    );
  });

  it("classifies cve.mitre.org URLs as security", () => {
    expect(
      classifyByRegex(
        "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-44228",
        "Log4Shell CVE",
      ),
    ).toBe("security");
  });

  it("classifies producthunt.com URLs as launch", () => {
    expect(classifyByRegex("https://producthunt.com/posts/some-new-app", "Some New App")).toBe(
      "launch",
    );
  });

  it("classifies Show HN posts as launch", () => {
    expect(
      classifyByRegex(
        "https://news.ycombinator.com/item?id=40000000",
        "Show HN: My new project",
      ),
    ).toBe("launch");
  });
});

// ── CVE pattern match (any domain) ────────────────────────────────────────

describe("classifyByRegex — CVE pattern", () => {
  it("classifies URLs containing CVE identifiers as security regardless of domain", () => {
    expect(
      classifyByRegex("https://example-blog.com/post/cve-2023-12345-analysis", "Analysis"),
    ).toBe("security");
    expect(
      classifyByRegex("https://some-tech-blog.com/article", "Patching CVE-2024-99999 in production"),
    ).toBe("security");
  });
});

// ── Fallback behaviour ────────────────────────────────────────────────────

describe("classifyByRegex — fallback and edge cases", () => {
  it("returns other for an unknown domain with no keyword signals", () => {
    expect(classifyByRegex("https://unknown-domain-xyz123.com/page", "Some random page")).toBe(
      "other",
    );
  });

  it("never throws on an invalid URL", () => {
    expect(() => classifyByRegex("not-a-url", "Some title")).not.toThrow();
    expect(classifyByRegex("not-a-url", "Some title")).toBe("other");
  });

  it("never throws on empty strings", () => {
    expect(() => classifyByRegex("", "")).not.toThrow();
    expect(classifyByRegex("", "")).toBe("other");
  });

  it("makes zero network requests (synchronous pure function)", () => {
    // This test verifies the function completes synchronously — if it were
    // async it would return a Promise, not a Category string.
    const result = classifyByRegex("https://arxiv.org/abs/1234", "Paper title");
    expect(typeof result).toBe("string");
  });
});

// ── Return value is always a valid Category ───────────────────────────────

describe("classifyByRegex — return type invariant", () => {
  it("always returns a valid Category", () => {
    const urls = [
      "https://github.com/owner/repo",
      "https://example.com",
      "not-a-url",
      "",
      "https://arxiv.org/abs/123",
      "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-1234",
    ];
    for (const url of urls) {
      const result = classifyByRegex(url, "title");
      expect(ALL_CATEGORIES).toContain(result);
    }
  });
});

// ── 50-URL fixture accuracy gate ─────────────────────────────────────────

describe("classifyByRegex — 50-URL fixture", () => {
  it("classifies each fixture URL to the expected category", () => {
    const results = FIXTURE.map((entry) => ({
      url: entry.url,
      expected: entry.expected,
      actual: classifyByRegex(entry.url, entry.title),
    }));

    // Report every mismatch for easier debugging
    const mismatches = results.filter((r) => r.actual !== r.expected);
    if (mismatches.length > 0) {
      const detail = mismatches
        .map((m) => `  ${m.url}\n    expected: ${m.expected}  actual: ${m.actual}`)
        .join("\n");
      console.warn(`Classifier mismatches:\n${detail}`);
    }

    const passCount = results.length - mismatches.length;
    const accuracy = passCount / results.length;

    // Hard accuracy gate: ≥ 80%
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies each individual fixture URL correctly", () => {
    for (const entry of FIXTURE) {
      expect(
        classifyByRegex(entry.url, entry.title),
        `URL: ${entry.url} (expected: ${entry.expected})`,
      ).toBe(entry.expected);
    }
  });
});

// ── BYOK classifier — helpers ─────────────────────────────────────────────

const TEST_URL = "https://github.com/owner/repo";
const TEST_TITLE = "Owner / Repo — GitHub";
const FAKE_OPENAI_KEY = "sk-test-openai-key";
const FAKE_ANTHROPIC_KEY = "ant-test-anthropic-key";
const FAKE_GEMINI_KEY = "test-gemini-api-key";

/** Mock a successful OpenAI-shaped fetch response. */
function openAIResponse(category: string): Response {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({ choices: [{ message: { content: category } }] }),
      ),
  } as unknown as Response;
}

/** Mock a successful Anthropic-shaped fetch response. */
function anthropicResponse(category: string): Response {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({ content: [{ type: "text", text: category }] }),
      ),
  } as unknown as Response;
}

/** Mock a successful Gemini-shaped fetch response. */
function geminiResponse(category: string): Response {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: category }] } }],
        }),
      ),
  } as unknown as Response;
}

/** HTTP error response. */
function httpErrorResponse(status: number): Response {
  return { ok: false, status } as unknown as Response;
}

/** Configure chrome.storage.local.get mock with a fixed storage state. */
function setupStorage(opts: {
  consent: boolean;
  openaiKey?: string;
  anthropicKey?: string;
  geminiKey?: string;
}): void {
  const store: Record<string, unknown> = {
    [CONSENT_KEY]: opts.consent,
    byok_openai: opts.openaiKey,
    byok_anthropic: opts.anthropicKey,
    byok_gemini: opts.geminiKey,
  };
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (key: unknown) =>
      Promise.resolve({ [key as string]: store[key as string] }),
  );
}

// ── BYOK — consent gate ───────────────────────────────────────────────────

describe("classifyWithBYOK — consent gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns consent-required error when byok_consent is not set", async () => {
    setupStorage({ consent: false, openaiKey: FAKE_OPENAI_KEY });
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Consent required: byok/consent");
    }
  });
});

// ── BYOK — missing API key ────────────────────────────────────────────────

describe("classifyWithBYOK — missing API key", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns no-key error when API key is not configured", async () => {
    setupStorage({ consent: true }); // no key provided
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("No API key configured");
    }
  });
});

// ── BYOK — OpenAI engine ──────────────────────────────────────────────────

describe("classifyWithBYOK — OpenAI", () => {
  beforeEach(() => {
    setupStorage({ consent: true, openaiKey: FAKE_OPENAI_KEY });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the category from a valid OpenAI response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(openAIResponse("tool")));
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result).toEqual({ ok: true, value: "tool" });
  });

  it("returns error on HTTP 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(httpErrorResponse(401)),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("401");
    }
  });

  it("returns error when response JSON is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("not json {{{"),
      }),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid JSON in response");
    }
  });

  it("returns error when response has unexpected shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ unexpected: "shape" })),
      }),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unexpected response format");
    }
  });

  it("returns error when response contains an unrecognised category", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(openAIResponse("banana")),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("banana");
    }
  });

  it("API key is never exposed in error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(httpErrorResponse(403)),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    if (!result.ok) {
      expect(result.error).not.toContain(FAKE_OPENAI_KEY);
    }
  });
});

// ── BYOK — Anthropic engine ───────────────────────────────────────────────

describe("classifyWithBYOK — Anthropic", () => {
  beforeEach(() => {
    setupStorage({ consent: true, anthropicKey: FAKE_ANTHROPIC_KEY });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the category from a valid Anthropic response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(anthropicResponse("security")),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "anthropic");
    expect(result).toEqual({ ok: true, value: "security" });
  });
});

// ── BYOK — Gemini engine ──────────────────────────────────────────────────

describe("classifyWithBYOK — Gemini", () => {
  beforeEach(() => {
    setupStorage({ consent: true, geminiKey: FAKE_GEMINI_KEY });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the category from a valid Gemini response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiResponse("research")),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "gemini");
    expect(result).toEqual({ ok: true, value: "research" });
  });
});

// ── BYOK — network errors ─────────────────────────────────────────────────

describe("classifyWithBYOK — network errors", () => {
  beforeEach(() => {
    setupStorage({ consent: true, openaiKey: FAKE_OPENAI_KEY });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns timeout error when fetch throws AbortError", async () => {
    const abortErr = new Error("The operation was aborted.");
    abortErr.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result).toEqual({ ok: false, error: "Request timed out" });
  });

  it("returns network error when fetch throws a generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );
    const result = await classifyWithBYOK(TEST_URL, TEST_TITLE, "openai");
    expect(result).toEqual({ ok: false, error: "Network error" });
  });
});

// ── BYOK — concurrency queue ──────────────────────────────────────────────

describe("classifyWithBYOK — concurrency queue", () => {
  beforeEach(() => {
    setupStorage({ consent: true, openaiKey: FAKE_OPENAI_KEY });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("processes concurrent calls and does not drop any", async () => {
    // Both calls should complete — queue ensures serialisation, not dropping.
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(openAIResponse("tool"))
        .mockResolvedValueOnce(openAIResponse("research")),
    );

    const [r1, r2] = await Promise.all([
      classifyWithBYOK("https://github.com/a", "A", "openai"),
      classifyWithBYOK("https://arxiv.org/b", "B", "openai"),
    ]);

    expect(r1).toEqual({ ok: true, value: "tool" });
    expect(r2).toEqual({ ok: true, value: "research" });
    // fetch was called exactly twice — second call was queued, not dropped
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});

// ── Classify router ───────────────────────────────────────────────────────

const BASE_BOOKMARK: BookmarkNode = {
  id: "bm-router-1",
  title: "Example Tool",
  url: "https://github.com/example/tool",
  parentId: "0",
  dateAdded: 1_700_000_000_000,
  meta: undefined,
};

describe("classify router — BYOK available + succeeds", () => {
  beforeEach(async () => {
    closeDb();
    await clearAllBookmarks();
    await upsertBookmark(BASE_BOOKMARK);
    setupStorage({
      consent: true,
      openaiKey: FAKE_OPENAI_KEY,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the BYOK category and engine when BYOK succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(openAIResponse("tool")));

    const result = await classify(
      BASE_BOOKMARK.id,
      BASE_BOOKMARK.url ?? "",
      BASE_BOOKMARK.title,
      "openai",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe("tool");
    expect(result.value.usedEngine).toBe("openai");
  });
});

describe("classify router — BYOK configured but fails → falls back to regex", () => {
  beforeEach(async () => {
    closeDb();
    await clearAllBookmarks();
    await upsertBookmark(BASE_BOOKMARK);
    setupStorage({
      consent: true,
      openaiKey: FAKE_OPENAI_KEY,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with regex category when BYOK returns an error", async () => {
    // BYOK returns HTTP 500 → classifyWithBYOK resolves to { ok: false }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    const result = await classify(
      BASE_BOOKMARK.id,
      BASE_BOOKMARK.url ?? "",
      BASE_BOOKMARK.title,
      "openai",
    );

    // Must always return ok — never propagate BYOK errors to caller
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Fell back to regex — engine must be "regex"
    expect(result.value.usedEngine).toBe("regex");
    // Regex should classify github.com as "tool"
    expect(result.value.category).toBe("tool");
  });

  it("returns ok with regex category when fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network Error")),
    );

    const result = await classify(
      BASE_BOOKMARK.id,
      BASE_BOOKMARK.url ?? "",
      BASE_BOOKMARK.title,
      "openai",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.usedEngine).toBe("regex");
    expect(result.value.category).toBe("tool");
  });
});

describe("classify router — BYOK not configured (no consent) → uses regex", () => {
  beforeEach(async () => {
    closeDb();
    await clearAllBookmarks();
    await upsertBookmark(BASE_BOOKMARK);
    setupStorage({ consent: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with regex result and makes zero fetch calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await classify(
      BASE_BOOKMARK.id,
      BASE_BOOKMARK.url ?? "",
      BASE_BOOKMARK.title,
      "openai",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.usedEngine).toBe("regex");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("getActiveEngine", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the BYOK engine when consent + key are configured", async () => {
    setupStorage({ consent: true, openaiKey: FAKE_OPENAI_KEY });
    const engine = await getActiveEngine("openai");
    expect(engine).toBe("openai");
  });

  it("returns 'regex' when consent is missing", async () => {
    setupStorage({ consent: false, openaiKey: FAKE_OPENAI_KEY });
    const engine = await getActiveEngine("openai");
    expect(engine).toBe("regex");
  });

  it("returns 'regex' when key is missing", async () => {
    setupStorage({ consent: true });
    const engine = await getActiveEngine("openai");
    expect(engine).toBe("regex");
  });
});
