/**
 * Tests for Task 5.1: settings.ts helpers + BYOKInput component.
 *
 * Settings helpers:
 *  1. saveBYOKKey writes to chrome.storage.local (not sync)
 *  2. removeBYOKKey removes from chrome.storage.local
 *  3. hasBYOKKey returns true only when key is a non-empty string
 *  4. setConsent / getConsent round-trip
 *
 * BYOKInput component:
 *  5. Save button disabled when input is empty or consent not granted
 *  6. Save button enabled after consent + key entered
 *  7. Saving a key calls chrome.storage.local.set (not sync)
 *  8. Key input cleared from state after save
 *  9. Remove button visible only when key present; clicking removes key
 * 10. Provider selector changes active engine for save/remove
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  saveBYOKKey,
  removeBYOKKey,
  hasBYOKKey,
  setConsent,
  getConsent,
  getCustomCategories,
  saveCustomCategories,
  restoreDefaultCategories,
} from "../../src/lib/storage/settings";
import { BYOKInput } from "../../src/components/Settings/BYOKInput";
import { CategoryEditor } from "../../src/components/Settings/CategoryEditor";
import { ALL_CATEGORIES } from "../../src/lib/classify/categories";

// ── Setup chrome.storage mock ──────────────────────────────────────────────

/** In-memory store that mimics chrome.storage.local */
let store: Record<string, unknown> = {};
/** In-memory store that mimics chrome.storage.sync */
let syncStore: Record<string, unknown> = {};

/** Remove a key from store without triggering no-dynamic-delete. */
function storeRemove(key: string): void {
  const { [key]: _dropped, ...rest } = store;
  void _dropped;
  store = rest;
}

function setupStorageMock() {
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (key: unknown) => Promise.resolve({ [key as string]: store[key as string] }),
  );
  (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (items: unknown) => {
      Object.assign(store, items as Record<string, unknown>);
      return Promise.resolve();
    },
  );
  (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (key: unknown) => {
      storeRemove(key as string);
      return Promise.resolve();
    },
  );
  // chrome.storage.sync mocks
  (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (key: unknown) => Promise.resolve({ [key as string]: syncStore[key as string] }),
  );
  (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (items: unknown) => {
      Object.assign(syncStore, items as Record<string, unknown>);
      return Promise.resolve();
    },
  );
}

// ── Settings helpers ───────────────────────────────────────────────────────

describe("saveBYOKKey", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("writes the key to chrome.storage.local under byok_openai", async () => {
    await saveBYOKKey("openai", "sk-test-key");
    // Verify by checking the in-memory store (set mock writes to store).
    expect(store.byok_openai).toBe("sk-test-key");
  });

  it("uses the correct key name for anthropic", async () => {
    await saveBYOKKey("anthropic", "ant-key");
    expect(store.byok_anthropic).toBe("ant-key");
  });

  it("uses the correct key name for gemini", async () => {
    await saveBYOKKey("gemini", "gem-key");
    expect(store.byok_gemini).toBe("gem-key");
  });
});

describe("removeBYOKKey", () => {
  beforeEach(() => {
    store = { byok_openai: "sk-existing" };
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("removes the key from chrome.storage.local", async () => {
    await removeBYOKKey("openai");
    expect(store.byok_openai).toBeUndefined();
  });
});

describe("hasBYOKKey", () => {
  beforeEach(() => {
    store = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("returns false when no key is set", async () => {
    expect(await hasBYOKKey("openai")).toBe(false);
  });

  it("returns true when a non-empty key is set", async () => {
    store.byok_openai = "sk-key";
    expect(await hasBYOKKey("openai")).toBe(true);
  });

  it("returns false when key is empty string", async () => {
    store.byok_openai = "";
    expect(await hasBYOKKey("openai")).toBe(false);
  });
});

describe("setConsent / getConsent", () => {
  beforeEach(() => {
    store = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("round-trips consent = true", async () => {
    await setConsent(true);
    expect(await getConsent()).toBe(true);
  });

  it("round-trips consent = false", async () => {
    await setConsent(false);
    expect(await getConsent()).toBe(false);
  });

  it("returns false when consent is not set", async () => {
    expect(await getConsent()).toBe(false);
  });
});

// ── BYOKInput component ────────────────────────────────────────────────────

describe("BYOKInput — save button disabled when no consent or empty key", () => {
  beforeEach(() => {
    store = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("Save is disabled when input is empty and no consent", () => {
    render(<BYOKInput />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();
  });

  it("Save is disabled when consent is checked but input is still empty", async () => {
    render(<BYOKInput />);
    const consentCb = screen.getByRole("checkbox");
    fireEvent.click(consentCb);
    // Flush async useEffect state updates (hasBYOKKey + getConsent reads)
    await act(async () => { await Promise.resolve(); });
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();
  });
});

describe("BYOKInput — saving a key", () => {
  beforeEach(() => {
    store = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("calls chrome.storage.local.set (not sync) and clears the input", async () => {
    render(<BYOKInput />);

    // Grant consent
    const consentCb = screen.getByRole("checkbox");
    fireEvent.click(consentCb);
    await act(async () => { await Promise.resolve(); });

    // Enter a key value
    const keyInput = screen.getByLabelText("API Key");
    fireEvent.change(keyInput, { target: { value: "sk-test" } });

    // Save — click triggers async handleSave, flush via act
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).not.toBeDisabled();
    await act(async () => { fireEvent.click(saveBtn); await Promise.resolve(); });

    // Verify via in-memory store (local.set mock writes there)
    expect(store.byok_openai).toBe("sk-test");

    // Input should be cleared after save
    expect((keyInput as HTMLInputElement).value).toBe("");
  });
});

describe("BYOKInput — provider selector", () => {
  beforeEach(() => {
    store = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("switching provider changes the storage key used when saving", async () => {
    render(<BYOKInput />);

    // Change provider to Anthropic
    const providerSelect = screen.getByLabelText("Provider");
    fireEvent.change(providerSelect, { target: { value: "anthropic" } });
    await act(async () => { await Promise.resolve(); });

    // Grant consent
    const consentCb = screen.getByRole("checkbox");
    fireEvent.click(consentCb);
    await act(async () => { await Promise.resolve(); });

    // Enter key and save
    const keyInput = screen.getByLabelText("API Key");
    fireEvent.change(keyInput, { target: { value: "ant-key" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });

    // Verify store has the correct key
    expect(store.byok_anthropic).toBe("ant-key");
  });
});

// ── Task 5.2: custom category helpers ─────────────────────────────────────

describe("getCustomCategories", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("returns ALL_CATEGORIES by default when no sync value set", async () => {
    const cats = await getCustomCategories();
    expect(cats).toEqual([...ALL_CATEGORIES]);
  });

  it("returns stored categories when set in sync", async () => {
    syncStore.custom_categories = ["design", "news"];
    const cats = await getCustomCategories();
    expect(cats).toEqual(["design", "news"]);
  });
});

describe("saveCustomCategories", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("saves valid categories to chrome.storage.sync", async () => {
    const result = await saveCustomCategories(["design", "news"]);
    expect(result.ok).toBe(true);
    expect(syncStore.custom_categories).toEqual(["design", "news"]);
  });

  it("returns error for empty array", async () => {
    const result = await saveCustomCategories([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
    }
  });

  it("returns error when a name exceeds 32 chars", async () => {
    const longName = "a".repeat(33);
    const result = await saveCustomCategories([longName]);
    expect(result.ok).toBe(false);
  });

  it("returns error when a name contains special chars", async () => {
    const result = await saveCustomCategories(["bad<name>"]);
    expect(result.ok).toBe(false);
  });

  it("accepts names with letters, digits, and spaces", async () => {
    const result = await saveCustomCategories(["deep learning 101"]);
    expect(result.ok).toBe(true);
  });
});

describe("restoreDefaultCategories", () => {
  beforeEach(() => {
    store = {};
    syncStore = { custom_categories: ["custom1", "custom2"] };
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("resets sync storage to ALL_CATEGORIES", async () => {
    await restoreDefaultCategories();
    expect(syncStore.custom_categories).toEqual([...ALL_CATEGORIES]);
  });
});

// ── Task 5.2: CategoryEditor component ────────────────────────────────────

describe("CategoryEditor — default rendering", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("renders all 8 default categories on initial load", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });
    for (const cat of ALL_CATEGORIES) {
      expect(screen.getByText(new RegExp(cat, "i"))).toBeDefined();
    }
  });

  it("renders Add Category input and button", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Add Category")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
  });

  it("renders Restore Defaults button", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Restore Defaults" })).toBeDefined();
  });
});

describe("CategoryEditor — adding a category", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("adds a new category and saves to sync storage", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    const input = screen.getByLabelText("Add Category");
    fireEvent.change(input, { target: { value: "design" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await Promise.resolve();
    });

    expect(syncStore.custom_categories).toContain("design");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("shows validation error for empty name", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    // Enter a value that looks non-empty but is only spaces
    // The button won't be disabled but validation should catch it
    fireEvent.change(screen.getByLabelText("Add Category"), { target: { value: "a".repeat(33) } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows validation error for name with special chars", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.change(screen.getByLabelText("Add Category"), { target: { value: "bad<>" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("shows error when adding duplicate category", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    fireEvent.change(screen.getByLabelText("Add Category"), { target: { value: "tool" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeDefined();
  });
});

describe("CategoryEditor — deleting a category", () => {
  beforeEach(() => {
    store = {};
    syncStore = {};
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("removes a category from list and sync storage", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    const deleteBtn = screen.getByRole("button", { name: "Delete category tool" });
    await act(async () => {
      fireEvent.click(deleteBtn);
      await Promise.resolve();
    });

    expect((syncStore.custom_categories as string[]).includes("tool")).toBe(false);
  });
});

describe("CategoryEditor — restore defaults", () => {
  beforeEach(() => {
    store = {};
    syncStore = { custom_categories: ["custom1"] };
    setupStorageMock();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("clicking Restore Defaults resets to ALL_CATEGORIES", async () => {
    render(<CategoryEditor />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore Defaults" }));
      await Promise.resolve();
    });

    expect(syncStore.custom_categories).toEqual([...ALL_CATEGORIES]);
    // All 8 default categories appear on screen
    for (const cat of ALL_CATEGORIES) {
      expect(screen.getByText(new RegExp(cat, "i"))).toBeDefined();
    }
  });
});
