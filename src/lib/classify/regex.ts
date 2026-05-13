/**
 * Regex-based bookmark classifier — Task 4.1
 *
 * Classifies a bookmark by URL and title using two passes:
 *   1. Domain pattern match (hostname-only, most reliable)
 *   2. Full-text pattern match (url + title, for keyword signals)
 *
 * Returns "other" when no rule matches. Never throws.
 * Makes zero network requests (pure function).
 *
 * Rule ordering: most specific / domain-unique categories first to prevent
 * overlap (e.g. arxiv.org must resolve to "research", not "technique").
 *
 * SECURITY: All inputs are strings used only in regex tests — no eval, no URL
 * construction, no network activity.
 */
import type { Category } from "../bookmarks/types";

interface Rule {
    category: Category;
    /** Tested against the URL hostname only. Faster and more precise. */
    domains?: RegExp;
    /** Tested against the full `"url title"` string. Used when domain alone
     *  is not a reliable signal (e.g. "CVE-2024-…" keyword in any domain). */
    pattern?: RegExp;
}

/**
 * Rules are evaluated in declaration order. The first match wins.
 * Categories with strong domain identity come first; "opinion" and "tool"
 * are broader and come later to avoid overriding more specific matches.
 */
const RULES: readonly Rule[] = [
    // ── research ──────────────────────────────────────────────────────────────
    {
        category: "research",
        domains:
            /^(?:.*\.)?(?:arxiv\.org|scholar\.google\.[a-z.]+|pubmed\.ncbi\.nlm\.nih\.gov|ieeexplore\.ieee\.org|dl\.acm\.org|semanticscholar\.org|researchgate\.net|ssrn\.com|aclanthology\.org|openreview\.net|papers\.nips\.cc|frontiersin\.org|biorxiv\.org|medrxiv\.org|hal\.science|jstor\.org|nature\.com|sciencedirect\.com|springer\.com|wiley\.com|tandfonline\.com)$/i,
    },
    // ── security ──────────────────────────────────────────────────────────────
    {
        category: "security",
        domains:
            /^(?:.*\.)?(?:cve\.mitre\.org|nvd\.nist\.gov|exploit-db\.com|hackerone\.com|bugcrowd\.com|portswigger\.net|owasp\.org|snyk\.io|shodan\.io|virustotal\.com|bleepingcomputer\.com|threatpost\.com|cert\.org|sans\.org|securelist\.com|huntr\.dev|intigriti\.com|pentest-tools\.com|osv\.dev|cvedetails\.com)$/i,
    },
    {
        // CVE identifier present anywhere in URL or title
        category: "security",
        pattern: /\bcve-\d{4}-\d{4,}\b/i,
    },
    // ── launch ────────────────────────────────────────────────────────────────
    {
        category: "launch",
        domains:
            /^(?:.*\.)?(?:producthunt\.com|betalist\.com|appsumo\.com|indiegogo\.com|kickstarter\.com|startengine\.com|republic\.com|wefunder\.com|launchly\.com)$/i,
    },
    {
        category: "launch",
        // Common "just shipped" signal phrases in title or URL path
        pattern:
            /\b(?:show hn:|just shipped|just launched|now live|announcing|we(?:'re)? launching|launching today|product launch|new release|v\d+\.\d+(?:\.\d+)? release|release notes?|changelog|what(?:'s)? new in)\b/i,
    },
    // ── commerce ──────────────────────────────────────────────────────────────
    {
        category: "commerce",
        domains:
            /^(?:.*\.)?(?:amazon\.[a-z.]{2,6}|ebay\.[a-z.]{2,6}|etsy\.com|shopify\.com|bestbuy\.com|newegg\.com|aliexpress\.com|gumroad\.com|lemonsqueezy\.com|paddle\.com|woocommerce\.com|bigcommerce\.com|walmart\.com|target\.com|costco\.com|homedepot\.com|wayfair\.com|zappos\.com)$/i,
    },
    // ── tool ──────────────────────────────────────────────────────────────────
    {
        category: "tool",
        domains:
            /^(?:.*\.)?(?:github\.com|gitlab\.com|bitbucket\.org|npmjs\.com|pypi\.org|packagist\.org|crates\.io|pkg\.go\.dev|rubygems\.org|hub\.docker\.com|registry\.terraform\.io|stackoverflow\.com|codepen\.io|jsfiddle\.net|replit\.com|codesandbox\.io|stackblitz\.com|vscode\.dev|cursor\.sh|jetbrains\.com|docker\.com|vercel\.com|netlify\.com|render\.com|fly\.io|railway\.app|heroku\.com|digitalocean\.com|linode\.com|vultr\.com|cloudflare\.com|fastly\.com|aws\.amazon\.com|cloud\.google\.com|azure\.microsoft\.com|kubernetes\.io|helm\.sh|terraform\.io|supabase\.com|planetscale\.com|neon\.tech|turso\.io|upstash\.com|temporal\.io|redis\.io|mongodb\.com|influxdata\.com|grafana\.com|datadog\.com|sentry\.io|posthog\.com|segment\.com|linear\.app|notion\.so|figma\.com|storybook\.js\.org|nx\.dev|turborepo\.org|expo\.dev|tauri\.app|electronjs\.org|wails\.io)$/i,
    },
    // ── technique ─────────────────────────────────────────────────────────────
    {
        category: "technique",
        domains:
            /^(?:.*\.)?(?:developer\.mozilla\.org|docs\.python\.org|developer\.apple\.com|developer\.android\.com|developer\.chrome\.com|developers\.google\.com|css-tricks\.com|smashingmagazine\.com|oreilly\.com|manning\.com|coursera\.org|udemy\.com|egghead\.io|pluralsight\.com|frontendmasters\.com|w3schools\.com|freecodecamp\.org|roadmap\.sh|patterns\.dev|refactoring\.guru|web\.dev|docs\.microsoft\.com|learn\.microsoft\.com|docs\.github\.com|docs\.gitlab\.com|react\.dev|vuejs\.org|angular\.io|svelte\.dev|nextjs\.org|nuxt\.com|astro\.build|remix\.run|fastapi\.tiangolo\.com|flask\.palletsprojects\.com|docs\.djangoproject\.com|expressjs\.com|fastify\.dev|nestjs\.com|rust-lang\.org|go\.dev|kotlinlang\.org|swift\.org|typescriptlang\.org|tailwindcss\.com|zod\.dev|tanstack\.com|vitejs\.dev|vitest\.dev|pnpm\.io|bun\.sh|deno\.land)$/i,
    },
    // ── opinion ───────────────────────────────────────────────────────────────
    {
        category: "opinion",
        domains:
            /^(?:.*\.)?(?:substack\.com|paulgraham\.com|joelonsoftware\.com|danluu\.com|stratechery\.com|overreacted\.io|hbr\.org|aeon\.co|slatestarcodex\.com|astralcodexten\.com|lesswrong\.com|waitbutwhy\.com|kottke\.org|lethain\.com|staffeng\.com|swyx\.io|theatlantic\.com|wired\.com|increment\.com|theverge\.com)$/i,
    },
    {
        // "Show HN:" posts are product launches, not opinions
        category: "launch",
        pattern: /\bshow hn:/i,
    },
    {
        // General Hacker News discussion / Ask HN → opinion
        category: "opinion",
        pattern: /\b(?:news\.ycombinator\.com|hacker\s*news)\b/i,
    },
];

/**
 * Classify a bookmark by URL + title using domain and keyword rules.
 *
 * @param url   The bookmark URL (should be a valid http/https URL; invalid
 *              URLs still work — hostname matching is skipped, pattern matching
 *              continues against the raw string).
 * @param title The bookmark title as stored in chrome.bookmarks.
 * @returns     The best-matching Category, or "other" if no rule matches.
 */
export function classifyByRegex(url: string, title: string): Category {
    const combined = `${url} ${title}`;

    let hostname = "";
    try {
        hostname = new URL(url).hostname.toLowerCase();
    } catch {
        // Invalid URL — domain matching unavailable, fall through to pattern rules.
    }

    for (const rule of RULES) {
        if (rule.domains !== undefined && hostname !== "" && rule.domains.test(hostname)) {
            return rule.category;
        }
        if (rule.pattern?.test(combined)) {
            return rule.category;
        }
    }

    return "other";
}
