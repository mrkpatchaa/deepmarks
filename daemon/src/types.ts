/**
 * Shared protocol types for the Deepmarks daemon.
 * Mirrors src/lib/bookmarks/types.ts but is self-contained for daemon use.
 */

export type Category =
  | "tool"
  | "security"
  | "technique"
  | "launch"
  | "research"
  | "opinion"
  | "commerce"
  | "other";

export interface BookmarkMeta {
  category: Category | undefined;
  tags: string[];
  classifiedAt: number | undefined;
  classifiedBy: string;
}

export interface BookmarkNode {
  id: string;
  title: string;
  url: string | undefined;
  parentId: string | undefined;
  dateAdded: number;
  meta: BookmarkMeta | undefined;
}

// ── Native Messaging protocol ───────────────────────────────────────────────

/** Message sent FROM the daemon TO the extension. */
export interface DaemonToExt {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}

/** Message sent FROM the extension TO the daemon. */
export interface ExtToDaemon {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}

// ── MCP tool interfaces ─────────────────────────────────────────────────────

export interface SearchBookmarksInput {
  query: string;
  limit?: number;
}

export interface SearchBookmarksResult {
  bookmarks: BookmarkNode[];
}

export interface ListCategoriesResult {
  categories: string[];
}

export interface GetBookmarkInput {
  id: string;
}

export interface GetBookmarkResult {
  bookmark: BookmarkNode | null;
}

export interface ExportWikiResult {
  markdown: string;
}

export interface ClassifyBookmarkInput {
  url: string;
  title: string;
}

export interface ClassifyBookmarkResult {
  category: Category;
}
