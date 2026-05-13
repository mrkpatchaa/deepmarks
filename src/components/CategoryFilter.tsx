/**
 * CategoryFilter — Task 3.3
 *
 * Horizontal pill row showing all 8 categories + "All" with count badges.
 * - Active pill highlights; inactive pills with 0 count are dimmed.
 * - Categories with 0 bookmarks are shown dimmed, not hidden.
 * - Clicking any pill fires onSelect(cat).  The parent decides toggle logic
 *   (clicking the active pill again should pass "all" to reset).
 *
 * SECURITY: No remote resources. Counts are derived from BookmarkNode data
 * already stored in IndexedDB — never from untrusted external input.
 */
import type { Category } from "../lib/bookmarks/types";

export type FilterCategory = Category | "all";

export interface CategoryCounts {
  all: number;
  tool: number;
  security: number;
  technique: number;
  launch: number;
  research: number;
  opinion: number;
  commerce: number;
  other: number;
}

export interface CategoryFilterProps {
  counts: CategoryCounts;
  selected: FilterCategory;
  onSelect: (cat: FilterCategory) => void;
}

const PILL_ORDER: FilterCategory[] = [
  "all",
  "tool",
  "security",
  "technique",
  "launch",
  "research",
  "opinion",
  "commerce",
  "other",
];

const LABELS: Record<FilterCategory, string> = {
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

export function CategoryFilter({
  counts,
  selected,
  onSelect,
}: CategoryFilterProps) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-4 py-2"
      style={{ scrollbarWidth: "none" }}
      role="group"
      aria-label="Filter by category"
    >
      {PILL_ORDER.map((cat) => {
        const count = counts[cat];
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
            {LABELS[cat]}
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
