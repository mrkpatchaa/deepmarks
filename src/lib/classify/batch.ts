/**
 * Batch classifier — runs classify() across a set of bookmarks.
 *
 * Skips:
 *  - Bookmarks that already have a category (use forceReclassify=true to override)
 *  - Bookmarks with no URL or a non-http/https URL
 *
 * Concurrency:
 *  - Regex engine: up to REGEX_CONCURRENCY parallel calls (fast, no rate limit)
 *  - BYOK engines: 1 at a time (the queue inside byok.ts serialises them anyway;
 *    firing one at a time avoids piling up the queue unnecessarily)
 *
 * Cancellation: pass an AbortSignal. When aborted, the current in-flight
 * classify() call finishes (it cannot be aborted mid-flight), then the loop
 * stops. Progress still reflects the actual work done.
 *
 * SECURITY: no user-controlled strings are used as code. This module only
 * calls classify(), which already validates URLs and sanitises all inputs.
 */
import type { BookmarkNode } from "../bookmarks/types";
import type { BYOKEngine } from "./byok";
import { classify, getActiveEngine } from "./router";
import type { ClassifyOutput } from "./router";
import { isSafeUrl } from "../bookmarks/url";

const REGEX_CONCURRENCY = 5;

export interface ClassifyAllProgress {
    done: number;
    total: number;
    failed: number;
    /** Items classified in the most-recent batch iteration — used for live UI updates. */
    recentlyClassified: ReadonlyArray<{ id: string; output: ClassifyOutput }>;
}

/**
 * Classify all eligible bookmarks in `bookmarks`.
 *
 * @param bookmarks        Source list (typically the full IDB set)
 * @param engine           Preferred BYOK engine; falls back to regex if unavailable
 * @param onProgress       Called after each item (or each batch for regex)
 * @param signal           AbortSignal — stop after the current item finishes
 * @param forceReclassify  When true, re-classify already-categorised bookmarks too
 */
export async function classifyAll(
    bookmarks: BookmarkNode[],
    engine: BYOKEngine,
    onProgress: (progress: ClassifyAllProgress) => void,
    signal: AbortSignal,
    forceReclassify = false,
): Promise<ClassifyAllProgress> {
    // Filter to eligible candidates.
    const candidates = bookmarks.filter((bm) => {
        if (!isSafeUrl(bm.url)) return false;
        if (!forceReclassify && bm.meta?.category !== undefined) return false;
        return true;
    });

    const total = candidates.length;
    let done = 0;
    let failed = 0;

    if (total === 0) {
        onProgress({ done: 0, total: 0, failed: 0, recentlyClassified: [] });
        return { done: 0, total: 0, failed: 0, recentlyClassified: [] };
    }

    // Detect which engine will actually be used so we can set concurrency.
    const activeEngine = await getActiveEngine(engine);
    const concurrency = activeEngine === "regex" ? REGEX_CONCURRENCY : 1;

    // Process in chunks of `concurrency`.
    for (let i = 0; i < candidates.length; i += concurrency) {
        if (signal.aborted) break;

        const chunk = candidates.slice(i, i + concurrency);
        const recentlyClassified: Array<{ id: string; output: ClassifyOutput }> = [];

        await Promise.all(
            chunk.map(async (bm) => {
                if (signal.aborted) return;
                try {
                    const result = await classify(
                        bm.id,
                        bm.url ?? "",
                        bm.title,
                        engine,
                    );
                    if (!result.ok) {
                        failed += 1;
                    } else {
                        recentlyClassified.push({ id: bm.id, output: result.value });
                    }
                } catch {
                    // Unexpected exception from classify() — count as failed and continue
                    // so one bad bookmark cannot stop the entire batch.
                    failed += 1;
                }
                done += 1;
            }),
        );

        onProgress({ done, total, failed, recentlyClassified });
    }

    return { done, total, failed, recentlyClassified: [] };
}
