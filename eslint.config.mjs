// @ts-check
import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Base recommended rules
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    rules: {
      // Disallow any — security: prevents bypassing type checks on untrusted data
      "@typescript-eslint/no-explicit-any": "error",
      // Require exhaustive checks on union types
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // Prevent floating Promises — all async code must be awaited or handled
      "@typescript-eslint/no-floating-promises": "error",
      // No unused variables (security: avoids dead code hiding issues)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // No non-null assertion — use proper nullability handling
      "@typescript-eslint/no-non-null-assertion": "error",
      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },
  {
    // Config files can use looser rules
    files: [
      "*.config.ts",
      "*.config.mjs",
      "*.config.js",
      "vitest.config.ts",
      "wxt.config.ts",
      "eslint.config.mjs",
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Test files: allow type assertions and less strict patterns
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Ignore generated and build output directories, and the daemon (separate Node.js package)
    ignores: [
      ".wxt/**",
      ".output/**",
      "node_modules/**",
      "daemon/**",
      "coverage/**",
    ],
  },
);
