/**
 * Wiki compiler — Task 6.1
 *
 * Pure function: takes BookmarkNode[] and returns a markdown string.
 *
 * Output structure:
 *   # Deepmarks Wiki
 *   <!-- generated — do not edit manually -->
 *
 *   ## Tool
 *   - [Title](https://example.com) — `example.com`
 *   > See also: [[security]] [[research]]
 *
 * Rules:
 *   - Each non-empty category gets a `## Category` heading (title-cased).
 *   - Empty categories are omitted entirely (not rendered as empty `##`).
 *   - Uncategorised bookmarks (category "other") appear under `## Other`.
 *   - `[[cat]]` references link to the anchor for that category section.
 *   - Bookmark URLs are sanitised: only http/https schemes are rendered;
 *     any other scheme results in the entry being omitted.
 *
 * SECURITY:
 *   - Pure function with no side effects.
 *   - All markdown output uses only string concatenation — no eval or templating.
 *   - URL allowlist enforced: /^https?:\/\//i before each link.
 *   - Title is passed through sanitizeText() to strip markdown-special chars.
 */
import type { BookmarkNode } from "../bookmarks/types";
import { ALL_CATEGORIES } from "../classify/categories";
import { SAFE_URL_RE } from "../bookmarks/url";

/** Strip characters that could break markdown link syntax. */
function sanitizeText(text: string): string {
  // Remove ] and [ which would break [Title](url) syntax
  return text.replace(/[[\]]/g, "");
}

/** Title-case a hyphen/space-separated string. */
function titleCase(str: string): string {
  return str
    .split(/[\s-]+/)
    .map((w) => (w.length > 0 ? (w[0] ?? "").toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The other categories referenced in the wiki cross-links (excludes self). */
function otherCategories(current: string, all: readonly string[]): string[] {
  return all.filter((c) => c !== current);
}

/**
 * Compile all classified bookmarks into a markdown wiki string.
 *
 * @param bookmarks - Array of BookmarkNode (any classification state).
 * @returns A markdown string.
 */
export function compileWiki(bookmarks: BookmarkNode[]): string {
  // Group by category; default "other" for unclassified
  const groups = new Map<string, BookmarkNode[]>();
  for (const cat of ALL_CATEGORIES) {
    groups.set(cat, []);
  }

  for (const bm of bookmarks) {
    const cat = bm.meta?.category ?? "other";
    if (bm.url === undefined || !SAFE_URL_RE.test(bm.url)) continue;
    const bucket = groups.get(cat) ?? groups.get("other") ?? [];
    bucket.push(bm);
  }

  const lines: string[] = [
    "# Deepmarks Wiki",
    "<!-- generated — do not edit manually -->",
    "",
  ];

  for (const cat of ALL_CATEGORIES) {
    const entries = groups.get(cat) ?? [];
    if (entries.length === 0) continue;

    lines.push(`## ${titleCase(cat)}`);
    lines.push("");

    for (const bm of entries) {
      // url is guaranteed non-undefined (filtered at grouping time)
      const url = bm.url ?? "";
      if (url === "") continue;
      const title = sanitizeText(bm.title.trim() !== "" ? bm.title : url);
      lines.push(`- [${title}](${url})`);
    }

    // Cross-links to the other non-empty categories
    const nonEmpty = otherCategories(cat, ALL_CATEGORIES).filter(
      (c) => (groups.get(c)?.length ?? 0) > 0,
    );
    if (nonEmpty.length > 0) {
      const refs = nonEmpty.map((c) => `[[${c}]]`).join(" ");
      lines.push("");
      lines.push(`> See also: ${refs}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
