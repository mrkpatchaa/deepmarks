/**
 * Popup — Task 5.3
 *
 * Shows: total bookmark count, active engine, two quick-action buttons.
 *
 * SECURITY:
 *   - No innerHTML or dangerouslySetInnerHTML.
 *   - No user-controlled content rendered without escaping.
 *   - chrome.sidePanel.open() requires windowId from chrome.windows.getCurrent().
 */
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../../assets/tailwind.css";
import { getAllBookmarks } from "../../lib/storage/db";
import { getActiveEngine } from "../../lib/classify/router";

const ENGINE_LABELS: Record<string, string> = {
  regex: "Regex (offline)",
  openai: "OpenAI (BYOK)",
  anthropic: "Anthropic (BYOK)",
  gemini: "Gemini (BYOK)",
};

function PopupApp() {
  const [count, setCount] = useState<number | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await getAllBookmarks();
      if (result.ok) {
        setCount(result.value.length);
      }
      const activeEngine = await getActiveEngine();
      setEngine(activeEngine);
    }
    void load();
  }, []);

  async function handleOpenSidePanel() {
    const win = await chrome.windows.getCurrent();
    if (win.id !== undefined) {
      await chrome.sidePanel.open({ windowId: win.id });
    }
    window.close();
  }

  function handleOpenSettings() {
    void chrome.runtime.openOptionsPage();
    window.close();
  }

  const engineLabel = engine !== null ? (ENGINE_LABELS[engine] ?? engine) : "…";
  const countLabel = count !== null ? String(count) : "…";

  return (
    <div className="min-w-[280px] bg-white p-4 dark:bg-zinc-900">
      <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Deepmarks
      </h1>

      <dl className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
        <div className="flex justify-between gap-4">
          <dt>Bookmarks</dt>
          <dd className="font-mono font-medium">{countLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Engine</dt>
          <dd>{engineLabel}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { void handleOpenSidePanel(); }}
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Open Side Panel
        </button>
        <button
          type="button"
          onClick={handleOpenSettings}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Settings
        </button>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);

