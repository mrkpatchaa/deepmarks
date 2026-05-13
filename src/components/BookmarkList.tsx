/**
 * BookmarkList — virtualized list of bookmark cards (Task 3.1).
 *
 * Uses @tanstack/react-virtual to keep only visible rows + 10 overscan
 * rows in the DOM, preventing frame drops on large libraries.
 *
 * The parent component is responsible for cursor-based page loading;
 * when the user scrolls within 5 rows of the bottom, `onScrollNearEnd`
 * is called so the parent can fetch the next page.
 */
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BookmarkNode } from "../lib/bookmarks/types";
import { BookmarkCard } from "./BookmarkCard";

const ESTIMATED_ROW_HEIGHT = 64; // px — approximate, virtualizer measures actual
const NEAR_END_THRESHOLD = 5; // rows from bottom before triggering next-page load

export interface BookmarkListProps {
  bookmarks: BookmarkNode[];
  onScrollNearEnd?: () => void;
  onClassify?: (bookmark: BookmarkNode) => void;
}

export function BookmarkList({ bookmarks, onScrollNearEnd, onClassify }: BookmarkListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
  });

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">No bookmarks yet</p>
      </div>
    );
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (onScrollNearEnd === undefined) return;
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < ESTIMATED_ROW_HEIGHT * NEAR_END_THRESHOLD) {
      onScrollNearEnd();
    }
  };

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      onScroll={handleScroll}
    >
      <div style={{ height: totalSize, position: "relative" }}>
        {virtualItems.map((item) => {
          const bookmark = bookmarks[item.index];
          if (bookmark === undefined) return null;
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: "translateY(" + String(item.start) + "px)",
              }}
            >
              <BookmarkCard bookmark={bookmark} onClassify={onClassify} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
