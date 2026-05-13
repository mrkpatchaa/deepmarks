/**
 * CategoryFilter — Task 3.3
 *
 * Horizontal pill row showing "All" + all categories present in counts.
 * - Active pill highlights; inactive pills with 0 count are dimmed.
 * - Categories with 0 bookmarks are shown dimmed, not hidden.
 * - Clicking any pill fires onSelect(cat). The parent decides toggle logic.
 * - Dynamically handles built-in and custom LLM-generated categories.
 *
 * SECURITY: No remote resources. Counts are derived from BookmarkNode data
 * already stored in IndexedDB — never from untrusted external input.
 */

/** "all" plus any category slug string. */
export type FilterCategory = string;

/**
 * Per-category counts keyed by slug, plus a mandatory "all" entry.
 * Dynamic to support custom LLM-generated categories beyond the 8 built-ins.
 */
export interface CategoryCounts {
  all: number;
  [key: string]: number;
}

export interface CategoryFilterProps {
  counts: CategoryCounts;
  selected: FilterCategory;
  onSelect: (cat: FilterCategory) => void;
}

/** Preferred display order for the 8 built-in categories. */
const BUILTIN_ORDER = [
  "tool",
  "security",
  "technique",
  "launch",
  "research",
  "opinion",
  "commerce",
  "other",
] as const;

/** Friendly labels for built-in categories. */
const BUILTIN_LABELS: Record<string, string> = {
  all: "All",
  tool: "Tool",
  security: "Security",
  technique: "Technique",
  launch: "Launch",
  research: "Research",
  opinion: "Opinion",
  commerce: "Commerce",
  other: "Other",
};

/** Capitalize a slug for display: "web-dev" → "Web-Dev". */
function slugLabel(slug: string): string {
  return (
    BUILTIN_LABELS[slug] ??
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("-")
  );
}

export function CategoryFilter({
  counts,
  selected,
  onSelect,
}: CategoryFilterProps) {
  // Build pill order: "all" first, then built-ins in canonical order (if
  // present in counts), then any additional custom slugs sorted alphabetically.
  const builtinSlugs = BUILTIN_ORDER.filter((cat) => cat in counts);
  const customSlugs = Object.keys(counts)
    .filter((cat) => cat !== "all" && !(BUILTIN_ORDER as readonly string[]).includes(cat))
    .sort();
  const pillOrder: FilterCategory[] = ["all", ...builtinSlugs, ...customSlugs];

  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-4 py-2"
      style={{ scrollbarWidth: "none" }}
      role="group"
      aria-label="Filter by category"
    >
      {pillOrder.map((cat) => {
        const count = counts[cat] ?? 0;
        const isActive = cat === selected;
        const isDimmed = cat !== "all" && count === 0;

        return (
          <button
            key={cat}
            type="button"
            onClick={() => { onSelect(cat); }}
            aria-pressed={isActive}
            className={[
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              isActive
                ? "bg-indigo-600 text-white"
                : isDimmed
                  ? "cursor-default bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
            ].join(" ")}
          >
            {slugLabel(cat)}
            <span
              className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                isActive
                  ? "bg-white/25 text-white"
                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
              ].join(" ")}
            >
              {String(count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
