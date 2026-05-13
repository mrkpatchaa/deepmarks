/**
 * Category definitions for Deepmarks — Task 4.1
 *
 * Each Category has display metadata. This is a pure constants module
 * with no side effects.
 */
import type { Category } from "../bookmarks/types";

export interface CategoryMeta {
  readonly label: string;
  readonly description: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  tool: {
    label: "Tool",
    description: "GitHub repos, CLI tools, npm packages, developer SaaS, open-source projects",
  },
  security: {
    label: "Security",
    description: "CVEs, vulnerabilities, exploits, security advisories, supply chain",
  },
  technique: {
    label: "Technique",
    description: "Tutorials, demos, docs, code patterns, how-to articles",
  },
  launch: {
    label: "Launch",
    description: "Product launches, announcements, crowdfunding, just-shipped posts",
  },
  research: {
    label: "Research",
    description: "ArXiv papers, academic publications, studies, research findings",
  },
  opinion: {
    label: "Opinion",
    description: "Takes, analysis, commentary, essays, newsletters, threads",
  },
  commerce: {
    label: "Commerce",
    description: "Shopping, marketplaces, product listings, physical goods",
  },
  other: {
    label: "Other",
    description: "Uncategorized / low-confidence",
  },
};

export const ALL_CATEGORIES: readonly Category[] = [
  "tool",
  "security",
  "technique",
  "launch",
  "research",
  "opinion",
  "commerce",
  "other",
] as const;
