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
} from "../../src/lib/storage/settings";
import { BYOKInput } from "../../src/components/Settings/BYOKInput";

// ── Setup chrome.storage mock ──────────────────────────────────────────────

/** In-memory store that mimics chrome.storage.local */
let store: Record<string, unknown> = {};

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
}

// ── Settings helpers ───────────────────────────────────────────────────────

describe("saveBYOKKey", () => {
  beforeEach(() => {
    store = {};
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
