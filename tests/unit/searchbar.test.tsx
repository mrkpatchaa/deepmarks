/**
 * Tests for SearchBar component (Task 3.2).
 *
 * Focus areas:
 *  1. Rendering the input and placeholder
 *  2. Debounced onSearch callback (150ms)
 *  3. Clear (×) button appears / disappears correctly
 *  4. Clearing resets query to ""
 *  5. Escape key focuses the input
 *  6. Result count display
 *
 * NOTE: We use fireEvent (synchronous) rather than userEvent.type for tests
 * that exercise fake timers; userEvent v14 + vi.useFakeTimers can deadlock
 * because user-event queues events with setTimeout internally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SearchBar } from "../../src/components/SearchBar";

// ------ setup fake timers ------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ------ helpers ------

function setup(onSearch = vi.fn(), resultCount?: number) {
  return {
    onSearch,
    ...render(<SearchBar onSearch={onSearch} resultCount={resultCount} />),
  };
}

function changeInput(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

// ------ tests ------

describe("SearchBar", () => {
  it("renders the search input with placeholder", () => {
    setup();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search bookmarks…")).toBeInTheDocument();
  });

  it("does not render the clear button when input is empty", () => {
    setup();
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
  });

  it("shows the clear button after typing", () => {
    setup();
    const input = screen.getByRole("searchbox");
    changeInput(input, "react");
    expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
  });

  it("debounces onSearch — not called before 150ms", () => {
    const onSearch = vi.fn();
    setup(onSearch);
    const input = screen.getByRole("searchbox");

    changeInput(input, "react");
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("debounces onSearch — fires exactly once at 150ms", () => {
    const onSearch = vi.fn();
    setup(onSearch);
    const input = screen.getByRole("searchbox");

    changeInput(input, "react");
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("react");
  });

  it("debounces multiple keystrokes — fires once for final value", () => {
    const onSearch = vi.fn();
    setup(onSearch);
    const input = screen.getByRole("searchbox");

    changeInput(input, "r");
    act(() => { vi.advanceTimersByTime(50); });
    changeInput(input, "re");
    act(() => { vi.advanceTimersByTime(50); });
    changeInput(input, "rea");
    // Not yet 150ms since last keystroke.
    expect(onSearch).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(150); });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("rea");
  });

  it("clears input and fires onSearch('') when clear button clicked", () => {
    const onSearch = vi.fn();
    setup(onSearch);
    const input = screen.getByRole("searchbox");

    changeInput(input, "rust");
    act(() => { vi.advanceTimersByTime(150); });
    onSearch.mockClear();

    fireEvent.click(screen.getByLabelText("Clear search"));

    expect((input as HTMLInputElement).value).toBe("");
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("");
    expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
  });

  it("focuses the input on Escape key press", () => {
    setup();
    const input = screen.getByRole("searchbox");
    fireEvent.blur(input);
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(input);
  });

  it("does not show result count when resultCount is undefined", () => {
    setup(vi.fn(), undefined);
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
  });

  it("shows 'No results' when resultCount is 0", () => {
    setup(vi.fn(), 0);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows '1 result' (singular) when resultCount is 1", () => {
    setup(vi.fn(), 1);
    expect(screen.getByText("1 result")).toBeInTheDocument();
  });

  it("shows '5 results' (plural) when resultCount is 5", () => {
    setup(vi.fn(), 5);
    expect(screen.getByText("5 results")).toBeInTheDocument();
  });
});

