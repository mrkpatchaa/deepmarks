/**
 * SearchBar — debounced full-text search input (Task 3.2).
 *
 * - 150ms debounce on input to avoid flooding the SEARCH message handler
 * - Clear (×) button resets query and refocuses the input
 * - Escape key focuses the input
 * - Result count displayed below
 *
 * SECURITY:
 *   - User input is passed verbatim to the SEARCH message handler which
 *     Zod-validates it (max 200 chars, string type). Rendering uses React
 *     text nodes only — no innerHTML.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface SearchBarProps {
  onSearch: (query: string) => void;
  resultCount: number | undefined; // undefined = initial state (no search yet)
}

export function SearchBar({ onSearch, resultCount }: SearchBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce: fire onSearch 150ms after the last keystroke.
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setValue(raw);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onSearch(raw.trim());
      }, 150);
    },
    [onSearch],
  );

  // Clear button: reset value, fire empty search, refocus.
  const handleClear = useCallback(() => {
    setValue("");
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onSearch("");
    inputRef.current?.focus();
  }, [onSearch]);

  // Escape key focuses the input (if focus is elsewhere, first press focuses;
  // if already focused with text, second press clears).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Clean up debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showCount = resultCount !== undefined;

  return (
    <div className="px-4 pt-3 pb-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={handleChange}
          placeholder="Search bookmarks…"
          aria-label="Search bookmarks"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 pr-8 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        {value.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            ×
          </button>
        )}
      </div>
      {showCount && (
        <p className="mt-1 text-xs text-zinc-400">
          {resultCount === 0
            ? "No results"
            : String(resultCount) + " result" + (resultCount === 1 ? "" : "s")}
        </p>
      )}
    </div>
  );
}
