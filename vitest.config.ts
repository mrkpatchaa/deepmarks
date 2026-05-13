import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
        passWithNoTests: true,
        coverage: {
            provider: "v8",
            reporter: ["text", "html", "json"],
            include: ["src/lib/**"],
            exclude: ["src/lib/**/*.d.ts"],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 70,
                statements: 80,
            },
        },
    },
    resolve: {
        alias: {
            "@": new URL("./src", import.meta.url).pathname,
        },
    },
});
