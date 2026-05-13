/**
 * ClassifyPanel — Task 4.3
 *
 * Shows the active classification engine badge and a "Classify" button for
 * a single bookmark. Classification result (category + engine used) is
 * surfaced to the parent via `onClassified`.
 *
 * SECURITY:
 *   - No innerHTML or dangerouslySetInnerHTML.
 *   - Classify action is user-initiated only — no auto-classification.
 *   - Engine badge is read from `getActiveEngine()` — no user-controlled strings.
 */
import { useState, useEffect } from "react";
import type { BookmarkNode, ClassifyEngine } from "../lib/bookmarks/types";
import type { BYOKEngine } from "../lib/classify/byok";
import { getActiveEngine } from "../lib/classify/router";
import { classify } from "../lib/classify/router";

export interface ClassifyResult {
  category: string;
  usedEngine: ClassifyEngine;
}

export interface ClassifyPanelProps {
  bookmark: BookmarkNode;
  preferredEngine?: BYOKEngine;
  onClassified?: (result: ClassifyResult) => void;
}

const ENGINE_LABELS: Record<ClassifyEngine, string> = {
  regex: "Regex (offline)",
  openai: "GPT-4o (BYOK)",
  anthropic: "Claude (BYOK)",
  gemini: "Gemini (BYOK)",
  ollama: "Ollama (local)",
};

export function ClassifyPanel({
  bookmark,
  preferredEngine = "openai",
  onClassified,
}: ClassifyPanelProps) {
  const [activeEngine, setActiveEngine] = useState<ClassifyEngine>("regex");
  const [isClassifying, setIsClassifying] = useState(false);
  const [lastResult, setLastResult] = useState<ClassifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refresh the active engine badge whenever the component mounts or the
  // preferred engine changes (e.g. after saving a BYOK key in Settings).
  useEffect(() => {
    void getActiveEngine(preferredEngine).then((engine) => {
      setActiveEngine(engine);
    });
  }, [preferredEngine]);

  async function handleClassify() {
    setIsClassifying(true);
    setError(null);

    const result = await classify(
      bookmark.id,
      bookmark.url ?? "",
      bookmark.title,
      preferredEngine,
    );

    setIsClassifying(false);

    if (result.ok) {
      const output: ClassifyResult = {
        category: result.value.category,
        usedEngine: result.value.usedEngine,
      };
      setLastResult(output);
      onClassified?.(output);
    } else {
      setError(result.error);
    }
  }

  const engineLabel = ENGINE_LABELS[activeEngine];

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        {/* Engine badge — always visible before classify runs */}
        <span
          aria-label={`Classification engine: ${engineLabel}`}
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
        >
          {`Engine: ${engineLabel}`}
        </span>

        {/* Classify button */}
        <button
          type="button"
          onClick={() => {
            void handleClassify();
          }}
          disabled={isClassifying}
          aria-busy={isClassifying}
          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isClassifying ? "Classifying…" : "Classify"}
        </button>
      </div>

      {/* Result badge — shown after classification */}
      {lastResult !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Category:</span>
          <span
            aria-label={`Category: ${lastResult.category}`}
            className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium capitalize text-blue-700 dark:bg-blue-900 dark:text-blue-200"
          >
            {lastResult.category}
          </span>
          {lastResult.usedEngine !== activeEngine && (
            <span className="text-xs text-zinc-400">
              (via {ENGINE_LABELS[lastResult.usedEngine]})
            </span>
          )}
        </div>
      )}

      {/* Error message — only when something went wrong */}
      {error !== null && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
