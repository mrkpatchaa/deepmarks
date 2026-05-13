/**
 * Tests for the regex classifier — Task 4.1
 *
 * Covers:
 *  1. Spec-required mappings (github.com→tool, arxiv.org→research, etc.)
 *  2. 50-URL fixture with ≥ 80% accuracy assertion
 *  3. Edge cases (invalid URL, empty strings, fallback to "other")
 */
import { describe, it, expect } from "vitest";
import type { Category } from "../../src/lib/bookmarks/types";
import { classifyByRegex } from "../../src/lib/classify/regex";
import { ALL_CATEGORIES } from "../../src/lib/classify/categories";

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
