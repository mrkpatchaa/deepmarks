/**
 * BYOKInput — Task 5.1
 *
 * Provider selector + masked API key field. On save, writes to
 * chrome.storage.local only. The raw key value never leaves this component
 * via props, attributes, or console.
 *
 * SECURITY:
 *   - `type="password"` + `autocomplete="off"` — no browser autofill capture.
 *   - Key is cleared from controlled state immediately after save to avoid
 *     holding it in React's reconciler longer than necessary.
 *   - No `console.log` of key value anywhere in this component.
 *   - "Remove" deletes from chrome.storage.local only.
 */
import { useState, useEffect } from "react";
import type { BYOKEngine } from "../../lib/classify/byok";
import {
  saveBYOKKey,
  removeBYOKKey,
  hasBYOKKey,
  setConsent,
  getConsent,
} from "../../lib/storage/settings";

const ENGINES: { value: BYOKEngine; label: string; isLocal?: boolean }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "ollama", label: "Ollama (local)", isLocal: true },
];

export function BYOKInput() {
  const [selectedEngine, setSelectedEngine] = useState<BYOKEngine>("openai");
  // Controlled input value — never logged, never put in aria-attributes.
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [consent, setConsentState] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "removed">("idle");

  const isLocal = selectedEngine === "ollama";

  // Refresh key-presence indicator whenever engine changes.
  useEffect(() => {
    void hasBYOKKey(selectedEngine).then(setHasKey);
    void getConsent().then(setConsentState);
  }, [selectedEngine]);

  async function handleSave() {
    if (keyInput === "") return;
    await setConsent(true);
    await saveBYOKKey(selectedEngine, keyInput);
    // Clear key from state immediately after save.
    setKeyInput("");
    setHasKey(true);
    setConsentState(true);
    setStatus("saved");
    setTimeout(() => { setStatus("idle"); }, 2000);
  }

  async function handleRemove() {
    await removeBYOKKey(selectedEngine);
    setHasKey(false);
    setStatus("removed");
    setTimeout(() => { setStatus("idle"); }, 2000);
  }

  async function handleConsentToggle(granted: boolean) {
    await setConsent(granted);
    setConsentState(granted);
  }

  return (
    <section aria-labelledby="byok-heading" className="space-y-4">
      <h2
        id="byok-heading"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
      >
        API Key (BYOK)
      </h2>

      {/* Provider selector */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="byok-engine"
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Provider
        </label>
        <select
          id="byok-engine"
          value={selectedEngine}
          onChange={(e) => {
            setSelectedEngine(e.target.value as BYOKEngine);
            setKeyInput("");
            setStatus("idle");
          }}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {ENGINES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      {/* Current key/model status */}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {hasKey
          ? isLocal ? "Model configured." : "A key is saved for this provider."
          : isLocal ? "No model set. Enter a model name below." : "No key saved for this provider."}
      </p>

      {/* Consent checkbox — not needed for Ollama (data stays on device) */}
      {!isLocal && (
        <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              void handleConsentToggle(e.target.checked);
            }}
            className="mt-0.5"
          />
          <span>
            I consent to sending bookmark URLs and titles to the selected AI
            provider for classification. Keys are stored on this device only and
            never synced.
          </span>
        </label>
      )}
      {isLocal && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Ollama runs entirely on your device — no data leaves your machine.
        </p>
      )}

      {/* Masked key field / model name field */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="byok-key"
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          {isLocal ? "Model" : "API Key"}
        </label>
        <input
          id="byok-key"
          type={isLocal ? "text" : "password"}
          autoComplete="off"
          placeholder={isLocal ? "e.g. llama3.2" : "Paste your API key…"}
          value={keyInput}
          onChange={(e) => { setKeyInput(e.target.value); }}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { void handleSave(); }}
          disabled={keyInput === "" || (!isLocal && !consent)}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLocal ? "Set model" : "Save"}
        </button>
        {hasKey && (
          <button
            type="button"
            onClick={() => { void handleRemove(); }}
            className="rounded-md border border-red-300 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Remove
          </button>
        )}
      </div>

      {/* Transient feedback */}
      {status === "saved" && (
        <p className="text-xs font-medium text-green-600 dark:text-green-400" role="status">
          Key saved.
        </p>
      )}
      {status === "removed" && (
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400" role="status">
          Key removed.
        </p>
      )}
    </section>
  );
}
