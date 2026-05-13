/**
 * WikiView — Task 6.2
 *
 * Renders compiled wiki markdown in the side panel using react-markdown
 * with rehype-sanitize (strict allowlist) and skipHtml: true.
 *
 * SECURITY:
 *   - `skipHtml: true` — raw HTML in markdown is never rendered.
 *   - `rehypePlugins: [rehypeSanitize]` — DOM output is sanitized by
 *     rehype-sanitize's default schema (allowlist, no script/iframe/etc.).
 *   - All anchor href values are checked against the SAFE_URL_RE allowlist
 *     before rendering; any non-http(s) href renders as inert text.
 *   - No innerHTML or dangerouslySetInnerHTML used anywhere in this file.
 */
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import type { ComponentPropsWithoutRef } from "react";
import { SAFE_URL_RE } from "../lib/bookmarks/url";

interface WikiViewProps {
  markdown: string;
}

/** Custom anchor renderer that enforces http(s) URL allowlist. */
function SafeAnchor({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
  if (href === undefined || !SAFE_URL_RE.test(href)) {
    // Render as inert span — never as a clickable link
    return <span {...rest}>{children}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
    >
      {children}
    </a>
  );
}

export function WikiView({ markdown }: WikiViewProps) {
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      aria-label="Wiki content"
    >
      <ReactMarkdown
        skipHtml
        rehypePlugins={[rehypeSanitize]}
        components={{ a: SafeAnchor }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
