/**
 * EngineSelector — compact inline dropdown for picking the classification engine.
 *
 * "Regex" is always available (no key required). BYOK engines appear only when
 * a key is configured and (for cloud engines) BYOK consent is given.
 *
 * SECURITY: reads only key-presence booleans — never the key values.
 */
import { useState, useEffect } from "react";
import type { ClassifyEngine } from "../../lib/bookmarks/types";
import type { BYOKEngine } from "../../lib/classify/byok";
import { hasBYOKKey, getConsent } from "../../lib/storage/settings";

interface EngineOption {
    value: ClassifyEngine;
    label: string;
    local?: boolean;
    alwaysAvailable?: boolean;
}

const ENGINE_OPTIONS: EngineOption[] = [
    { value: "regex", label: "Regex", alwaysAvailable: true },
    { value: "ollama", label: "Ollama", local: true },
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
    { value: "gemini", label: "Gemini" },
];

const BYOK_OPTIONS = ENGINE_OPTIONS.filter(
    (e): e is EngineOption & { value: BYOKEngine } => e.alwaysAvailable !== true,
);

interface Props {
    value: ClassifyEngine;
    onChange: (engine: ClassifyEngine) => void;
}

export function EngineSelector({ value, onChange }: Props) {
    const [available, setAvailable] = useState<ClassifyEngine[]>(["regex"]);

    useEffect(() => {
        async function refresh() {
            const consent = await getConsent();
            const flags = await Promise.all(BYOK_OPTIONS.map((e) => hasBYOKKey(e.value)));
            const configured = BYOK_OPTIONS.filter(
                (e, i) => (flags[i] ?? false) && (e.local === true || consent),
            ).map((e) => e.value);
            setAvailable(["regex", ...configured]);
        }

        void refresh();
        const cb = () => { void refresh(); };
        chrome.storage.local.onChanged.addListener(cb);
        return () => { chrome.storage.local.onChanged.removeListener(cb); };
    }, []);

    // If the saved value is no longer available, fall back to regex.
    const safeValue = available.includes(value) ? value : "regex";

    return (
        <select
            aria-label="Classification engine"
            value={safeValue}
            onChange={(e) => { onChange(e.target.value as ClassifyEngine); }}
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
