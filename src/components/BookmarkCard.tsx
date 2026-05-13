/**
 * BookmarkCard — renders a single bookmark row in the side panel (Task 3.1).
 *
 * SECURITY:
 *   - Only http/https URLs are rendered as <a> elements; all other schemes
 *     produce inert <span> text, never anchor href attributes.
 *   - No dangerouslySetInnerHTML, no innerHTML.
 *   - No remote favicon requests — domain initial letter badge only.
 */
import type { BookmarkNode } from "../lib/bookmarks/types";
import { domainInitial, isSafeUrl } from "../lib/bookmarks/url";

export interface BookmarkCardProps {
  bookmark: BookmarkNode;
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const { title, url } = bookmark;
  const initial = domainInitial(url);
  const safe = isSafeUrl(url);

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
      {/* Domain-initial letter badge — no remote image, no network request */}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium uppercase dark:bg-zinc-700"
      >
        {initial}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </p>

        {url !== undefined && (
          safe ? (
            /* Only http/https URLs become anchor elements */
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-xs text-blue-500 hover:underline"
            >
              {url}
            </a>
          ) : (
            /* All other schemes render as inert non-clickable text */
            <span className="block truncate text-xs text-zinc-400">
              {url}
            </span>
          )
        )}
      </div>
    </div>
  );
}
