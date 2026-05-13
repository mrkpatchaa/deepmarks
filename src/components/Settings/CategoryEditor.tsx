/**
 * CategoryEditor — Task 5.2
 *
 * Lets users add/delete custom categories, restore defaults.
 * Persists to `chrome.storage.sync` (synced across devices).
 * Side panel CategoryFilter listens to storage.sync.onChanged and updates.
 *
 * SECURITY:
 *   - All input validated by Zod (CategoryNameSchema) before write.
 *   - No innerHTML or dangerouslySetInnerHTML.
 *   - No eval or dynamic script execution.
 */
import { useState, useEffect } from "react";
import {
  getCustomCategories,
  saveCustomCategories,
  restoreDefaultCategories,
  CategoryNameSchema,
} from "../../lib/storage/settings";
import { ALL_CATEGORIES } from "../../lib/classify/categories";

export function CategoryEditor() {
  const [categories, setCategories] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadCategories() {
    setCategories(await getCustomCategories());
  }

  useEffect(() => {
    void loadCategories();

    function onStorageChange() {
      void loadCategories();
    }
    chrome.storage.sync.onChanged.addListener(onStorageChange);
    return () => {
      chrome.storage.sync.onChanged.removeListener(onStorageChange);
    };
  }, []);

  function validateName(name: string): string | null {
    const result = CategoryNameSchema.safeParse(name);
    return result.success ? null : (result.error.issues[0]?.message ?? "Invalid name");
  }

  async function handleAdd() {
    const trimmed = newName.trim();
    const err = validateName(trimmed);
    if (err !== null) {
      setValidationError(err);
      return;
    }
    if (categories.includes(trimmed)) {
      setValidationError("Category already exists");
      return;
    }
    setValidationError(null);
    const updated = [...categories, trimmed];
    const result = await saveCustomCategories(updated);
    if (result.ok) {
      setCategories(updated);
      setNewName("");
    } else {
      setSaveError(result.error);
    }
  }

  async function handleDelete(name: string) {
    const updated = categories.filter((c) => c !== name);
    if (updated.length === 0) {
      setSaveError("Cannot delete all categories. Use 'Restore Defaults' instead.");
      return;
    }
    const result = await saveCustomCategories(updated);
    if (result.ok) {
      setCategories(updated);
    } else {
      setSaveError(result.error);
    }
  }

  async function handleRestoreDefaults() {
    await restoreDefaultCategories();
    setCategories([...ALL_CATEGORIES]);
    setSaveError(null);
  }

  return (
    <section aria-labelledby="category-editor-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          id="category-editor-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Categories
        </h2>
        <button
          type="button"
          onClick={() => { void handleRestoreDefaults(); }}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Restore Defaults
        </button>
      </div>

      {/* Category list */}
      <ul className="space-y-1" aria-label="Category list">
        {categories.map((name) => (
          <li
            key={name}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
          >
            <span className="capitalize">{name}</span>
            <button
              type="button"
              aria-label={`Delete category ${name}`}
              onClick={() => { void handleDelete(name); }}
              className="ml-2 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Add new category */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="new-category"
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Add Category
        </label>
        <div className="flex gap-2">
          <input
            id="new-category"
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { void handleAdd(); }
            }}
            maxLength={32}
            placeholder="e.g. design"
            aria-describedby={validationError !== null ? "new-category-error" : undefined}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => { void handleAdd(); }}
            disabled={newName.trim() === ""}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {validationError !== null && (
          <p id="new-category-error" className="text-xs text-red-500" role="alert">
            {validationError}
          </p>
        )}
      </div>

      {saveError !== null && (
        <p className="text-xs text-red-500" role="alert">
          {saveError}
        </p>
      )}
    </section>
  );
}
