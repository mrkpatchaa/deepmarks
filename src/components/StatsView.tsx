/**
 * StatsView — Stats/Viz tab
 *
 * Shows an at-a-glance overview of the bookmark collection:
 * - Total / classified / unclassified counts
 * - Category distribution as horizontal bar chart
 * - Top link domains as horizontal bar chart
 *
 * Fetches its own data via getStatsData() on mount so the parent (App.tsx)
 * doesn't need to hold additional state.  All computation is local — no
 * network requests are made.
 */
import { useEffect, useState } from "react";
import { getStatsData } from "../lib/storage/db";
import type { StatsData } from "../lib/storage/db";

/** Colour palette for category bars (indigo → violet spectrum). */
const CATEGORY_COLORS: string[] = [
    "#6366f1",
    "#7c3aed",
    "#8b5cf6",
    "#a78bfa",
    "#818cf8",
    "#c084fc",
    "#a5b4fc",
    "#ddd6fe",
];

/** Colour palette for domain bars (teal → cyan spectrum). */
const DOMAIN_COLORS: string[] = [
    "#0d9488",
    "#0891b2",
    "#06b6d4",
    "#14b8a6",
    "#22d3ee",
    "#2dd4bf",
    "#67e8f9",
    "#5eead4",
    "#a5f3fc",
    "#99f6e4",
];

interface BarRowProps {
    label: string;
    count: number;
    maxCount: number;
    total: number;
    color: string;
}

function BarRow({ label, count, maxCount, total, color }: BarRowProps) {
    const barPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
    const ofTotal =
        total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";

    return (
        <div className="flex items-center gap-2 py-0.5">
            <span
                className="w-28 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
                title={label}
            >
                {label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                        width: `${barPct.toFixed(1)}%`,
                        backgroundColor: color,
                    }}
                />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                {count.toLocaleString()}
            </span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                {ofTotal}%
            </span>
        </div>
    );
}

export function StatsView() {
    const [data, setData] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void (async () => {
            const result = await getStatsData(15);
            if (result.ok) {
                setData(result.value);
            }
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex h-32 items-center justify-center">
                <p className="text-sm text-zinc-400">Loading…</p>
            </div>
        );
    }

    if (data === null || data.total === 0) {
        return (
            <div className="flex h-32 items-center justify-center px-6 text-center">
                <p className="text-sm text-zinc-400">
                    No bookmarks yet. Click <strong>Sync</strong> to import your Chrome bookmarks.
                </p>
            </div>
        );
    }

    const classifiedPct =
        data.total > 0
            ? ((data.classified / data.total) * 100).toFixed(0)
            : "0";
    const unclassified = data.total - data.classified;

    const maxCatCount = data.categories[0]?.count ?? 1;
    const maxDomainCount = data.topDomains[0]?.count ?? 1;

    return (
        <div className="space-y-5 overflow-y-auto px-4 py-4">
            {/* Overview */}
            <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Overview
                </h2>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="text-sm text-zinc-700 dark:text-zinc-200">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {data.total.toLocaleString()}
                        </span>{" "}
                        bookmarks
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {data.classified.toLocaleString()} classified (
                        {classifiedPct}%)
                        {unclassified > 0 &&
                            ` · ${unclassified.toLocaleString()} unclassified`}
                    </p>
                </div>
            </section>

            {/* Category distribution */}
            {data.categories.length > 0 && (
                <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Categories
                    </h2>
                    <div className="space-y-1">
                        {data.categories.map((cat, i) => (
                            <BarRow
                                key={cat.name}
                                label={cat.name}
                                count={cat.count}
                                maxCount={maxCatCount}
                                total={data.classified}
                                color={
                                    CATEGORY_COLORS[
                                        i % CATEGORY_COLORS.length
                                    ] ?? "#6366f1"
                                }
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Top link domains */}
            {data.topDomains.length > 0 && (
                <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Top Sites
                    </h2>
                    <div className="space-y-1">
                        {data.topDomains.map((d, i) => (
                            <BarRow
                                key={d.domain}
                                label={d.domain}
                                count={d.count}
                                maxCount={maxDomainCount}
                                total={data.total}
                                color={
                                    DOMAIN_COLORS[i % DOMAIN_COLORS.length] ??
                                    "#0d9488"
                                }
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
