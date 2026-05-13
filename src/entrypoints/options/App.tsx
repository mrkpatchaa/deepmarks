/**
 * Options page root — Task 5.1
 *
 * Provider BYOK key management and engine status dashboard.
 *
 * SECURITY:
 *   - Keys written to chrome.storage.local only (via BYOKInput).
 *   - No key values are rendered or logged anywhere in this file.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "../../assets/tailwind.css";
import { BYOKInput } from "../../components/Settings/BYOKInput";
import { ClassifyEngineStatus } from "../../components/Settings/ClassifyEngineStatus";
import { CategoryEditor } from "../../components/Settings/CategoryEditor";

function OptionsApp() {
  return (
    <div className="min-h-screen bg-white px-4 py-8 dark:bg-zinc-900">
      <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Deepmarks Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure your bookmark classification engine.
        </p>
      </header>

      <hr className="border-zinc-200 dark:border-zinc-700" />

      <ClassifyEngineStatus />

      <hr className="border-zinc-200 dark:border-zinc-700" />

      <BYOKInput />

      <hr className="border-zinc-200 dark:border-zinc-700" />

      <CategoryEditor />
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

