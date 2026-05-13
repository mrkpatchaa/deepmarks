/**
 * Tests for CategoryFilter component (Task 3.3).
 *
 * Focus areas:
 *  1. Renders all 9 pills (All + 8 categories)
 *  2. "All" pill is active by default
 *  3. Active pill has aria-pressed="true"
 *  4. Dimmed styling applied to categories with 0 count
 *  5. Count badge shows the correct number
 *  6. Clicking a pill fires onSelect with that category
 *  7. Clicking the active pill fires onSelect("all") — handled by parent toggle
 *  8. "All" count equals sum of individual categories
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CategoryFilter } from "../../src/components/CategoryFilter";
import type { CategoryCounts, FilterCategory } from "../../src/components/CategoryFilter";

// ------ helpers ------

function makeCounts(overrides: Partial<CategoryCounts> = {}): CategoryCounts {
  return {
    all: 10,
    tool: 3,
    security: 2,
    technique: 1,
    launch: 1,
    research: 1,
    opinion: 1,
    commerce: 1,
    other: 0,
    ...overrides,
  };
}

function setup(
  selected: FilterCategory = "all",
  counts = makeCounts(),
  onSelect = vi.fn(),
) {
  return {
    onSelect,
    ...render(
      <CategoryFilter counts={counts} selected={selected} onSelect={onSelect} />,
    ),
  };
}

// ------ tests ------

describe("CategoryFilter", () => {
  it("renders all 9 pills", () => {
    setup();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(9); // All + 8 categories
  });

  it("renders the 'All' pill with correct count", () => {
    setup("all", makeCounts({ all: 42 }));
    const allBtn = screen.getByRole("button", { name: /All/i });
    expect(allBtn).toBeInTheDocument();
    expect(allBtn).toHaveTextContent("42");
  });

  it("'All' pill has aria-pressed=true when selected='all'", () => {
    setup("all");
    const allBtn = screen.getByRole("button", { name: /All/i });
    expect(allBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("'All' pill has aria-pressed=false when another category is selected", () => {
    setup("tool");
    const allBtn = screen.getByRole("button", { name: /All/i });
    expect(allBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("active category pill has aria-pressed=true", () => {
    setup("security");
    const secBtn = screen.getByRole("button", { name: /Security/i });
    expect(secBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("renders a count badge for each category", () => {
    const counts = makeCounts({
      tool: 5,
      security: 3,
      other: 0,
    });
    setup("all", counts);
    // "Tool" button should contain "5" somewhere
    expect(screen.getByRole("button", { name: /Tool/i })).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /Security/i })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Other/i })).toHaveTextContent("0");
  });

  it("calls onSelect with the clicked category", async () => {
    const onSelect = vi.fn();
    setup("all", makeCounts(), onSelect);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tool/i }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("tool");
  });

  it("calls onSelect('all') when the All pill is clicked", async () => {
    const onSelect = vi.fn();
    setup("all", makeCounts(), onSelect);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^All/i }));

    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("calls onSelect with the same category when clicking the active pill (parent handles toggle)", async () => {
    // The component always calls onSelect(cat) — the parent decides to toggle
    const onSelect = vi.fn();
    setup("tool", makeCounts(), onSelect);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tool/i }));

    // Component calls onSelect("tool"); parent's handleCategorySelect will set to "all"
    expect(onSelect).toHaveBeenCalledWith("tool");
  });

  it("applies dimmed class to a category with count 0", () => {
    const counts = makeCounts({ other: 0 });
    setup("all", counts);
    const otherBtn = screen.getByRole("button", { name: /Other/i });
    // cursor-default is only applied when isDimmed
    expect(otherBtn.className).toContain("cursor-default");
  });

  it("does NOT apply dimmed class to a category with count > 0", () => {
    const counts = makeCounts({ tool: 3 });
    setup("all", counts);
    const toolBtn = screen.getByRole("button", { name: /Tool/i });
    expect(toolBtn.className).not.toContain("cursor-default");
  });

  it("renders all 8 named category labels", () => {
    setup();
    const expectedLabels = [
      "All",
      "Tool",
      "Security",
      "Technique",
      "Launch",
      "Research",
      "Opinion",
      "Commerce",
      "Other",
    ];
    for (const label of expectedLabels) {
      expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("uses a group role with accessible label", () => {
    setup();
    expect(screen.getByRole("group", { name: /Filter by category/i })).toBeInTheDocument();
  });

  it("renders custom LLM-generated category slugs as capitalised pills", () => {
    const counts: CategoryCounts = { all: 5, tool: 3, blockchain: 2 };
    setup("all", counts, vi.fn());
    // 3 pills: All, Tool, blockchain
    expect(screen.getAllByRole("button")).toHaveLength(3);
    // custom slug "blockchain" → label "Blockchain"
    expect(
      screen.getByRole("button", { name: /Blockchain/i }),
    ).toBeInTheDocument();
  });

  it("orders built-ins before custom slugs", () => {
    const counts: CategoryCounts = { all: 5, tool: 3, zzzcustom: 1, security: 1 };
    setup("all", counts, vi.fn());
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent?.trim() ?? "");
    const toolIdx = labels.findIndex((l) => /^Tool/.test(l));
    const secIdx = labels.findIndex((l) => /^Security/.test(l));
    const customIdx = labels.findIndex((l) => /^Zzzcustom/.test(l));
    // built-ins must come before custom slugs
    expect(toolIdx).toBeLessThan(customIdx);
    expect(secIdx).toBeLessThan(customIdx);
  });
});
