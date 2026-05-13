/**
 * ClassifyEngineStatus — Task 5.1
 *
 * Shows the active classification engine for each BYOK provider.
 * Updates immediately when key presence changes (listens to storage events).
 *
 * SECURITY: Does not display key values — only presence booleans.
 */
import { useState, useEffect } from "react";
import type { BYOKEngine } from "../../lib/classify/byok";
import { hasBYOKKey, getConsent } from "../../lib/storage/settings";

interface EngineStatus {
  engine: BYOKEngine;
  label: string;
  hasKey: boolean;
  isLocal: boolean;
}

const ENGINES: { value: BYOKEngine; label: string; isLocal?: boolean }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama", isLocal: true },
];

export function ClassifyEngineStatus() {
  const [statuses, setStatuses] = useState<EngineStatus[]>([]);
  const [consent, setConsent] = useState(false);

  async function refreshStatuses() {
    const [consentFlag, ...keyFlags] = await Promise.all([
      getConsent(),
      ...ENGINES.map((e) => hasBYOKKey(e.value)),
    ]);
    setConsent(consentFlag);
    setStatuses(
      ENGINES.map((e, i) => ({
        engine: e.value,
        label: e.label,
        hasKey: keyFlags[i] ?? false,
        isLocal: e.isLocal === true,
      })),
    );
  }

  useEffect(() => {
    void refreshStatuses();

    // Re-read when any storage key changes (e.g. key saved in another tab).
    function onStorageChange() {
      void refreshStatuses();
    }

    chrome.storage.local.onChanged.addListener(onStorageChange);
    return () => {
      chrome.storage.local.onChanged.removeListener(onStorageChange);
    };
  }, []);

  return (
    <section aria-labelledby="engine-status-heading" className="space-y-3">
      <h2
        id="engine-status-heading"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        Classification Engine Status
      </h2>

      {!consent && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Consent not granted — using Regex (offline) for all bookmarks.
        </p>
      )}

      <ul className="space-y-2">
        {statuses.map((s) => {
          // Ollama is local — no consent needed for activation.
          const active = (s.isLocal || consent) && s.hasKey;
          return (
            <li key={s.engine} className="flex items-center gap-2">
              {/* Status dot */}
              <span
                aria-hidden="true"
                className={[
                  "h-2 w-2 rounded-full",
                  active
                    ? s.isLocal ? "bg-emerald-500" : "bg-green-500"
                    : "bg-zinc-300 dark:bg-zinc-600",
                ].join(" ")}
              />
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                {s.label}
              </span>
              <span
                className={[
                  "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                  active
                    ? s.isLocal
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
                ].join(" ")}
              >
                {active
                  ? s.isLocal ? "Running locally" : "Active"
                  : s.hasKey && !s.isLocal ? "No consent" : "Not configured"}
              </span>
            </li>
          );
        })}

        {/* Regex is always the last fallback */}
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-blue-400"
          />
          <span className="text-xs text-zinc-700 dark:text-zinc-300">
            Regex
          </span>
          <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            Fallback
          </span>
        </li>
      </ul>
    </section>
  );
}
