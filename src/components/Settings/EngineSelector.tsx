/**
 * EngineSelector — compact inline dropdown for picking the classification engine.
 *
 * Only renders when at least one BYOK provider is configured and ready.
 * Updates its available-options list live whenever storage changes (e.g. user
 * adds / removes a key in the Settings tab).
 *
 * SECURITY: reads only key-presence booleans — never the key values.
 */
import { useState, useEffect } from "react";
import type { BYOKEngine } from "../../lib/classify/byok";
import { hasBYOKKey, getConsent } from "../../lib/storage/settings";

interface EngineOption {
    value: BYOKEngine;
    label: string;
    local?: boolean;
}

const ENGINE_OPTIONS: EngineOption[] = [
    { value: "ollama", label: "Ollama", local: true },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "gemini", label: "Gemini" },
];

interface Props {
    value: BYOKEngine;
    onChange: (engine: BYOKEngine) => void;
}

export function EngineSelector({ value, onChange }: Props) {
    const [available, setAvailable] = useState<BYOKEngine[]>([]);

    useEffect(() => {
        async function refresh() {
            const consent = await getConsent();
            const flags = await Promise.all(ENGINE_OPTIONS.map((e) => hasBYOKKey(e.value)));
            setAvailable(
                ENGINE_OPTIONS.filter((e, i) => (flags[i] ?? false) && (e.local === true || consent))
                    .map((e) => e.value),
            );
        }

        void refresh();
        const cb = () => { void refresh(); };
        chrome.storage.local.onChanged.addListener(cb);
        return () => { chrome.storage.local.onChanged.removeListener(cb); };
    }, []);

    // Nothing to choose if no BYOK provider is configured.
    if (available.length === 0) return null;

    // If the saved value is no longer available, fall back to the first option.
    const safeValue = available.includes(value) ? value : (available[0] ?? "openai");

    return (
        <select
            aria-label="Classification engine"
            value={safeValue}
            onChange={(e) => { onChange(e.target.value as BYOKEngine); }}
            className="rounded border border-zinc-200 bg-transparent px-1.5 py-0.5 text-xs text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:text-zinc-400"
        >
            {ENGINE_OPTIONS.filter((e) => available.includes(e.value)).map((e) => (
                <option key={e.value} value={e.value}>
                    {e.label}
                </option>
            ))}
        </select>
    );
}
