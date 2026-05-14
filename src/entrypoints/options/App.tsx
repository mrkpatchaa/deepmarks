/**
 * Options page — redirects users to the Settings tab in the sidepanel.
 *
 * All settings (BYOK keys, engine status, categories) now live in the
 * Deepmarks sidepanel under the Settings tab. This page exists only
 * because Chrome requires an options page when one is declared in the
 * manifest.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "../../assets/tailwind.css";

function OptionsApp() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-zinc-900">
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Deepmarks Settings
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Settings have moved to the Deepmarks sidepanel.
        </p>
        <button
          type="button"
          onClick={() => {
            void chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Open Deepmarks
        </button>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);

