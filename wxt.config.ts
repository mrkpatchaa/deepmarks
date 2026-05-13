import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
    srcDir: "src",
    modules: ["@wxt-dev/module-react"],
    vite: () => ({
        plugins: [tailwindcss()],
    }),
    manifest: {
        name: "Deepmarks",
        description:
            "Local-first AI bookmark manager — search, classify, and query your bookmarks with AI, zero data leaves your machine",
        version: "0.1.0",
        permissions: ["bookmarks", "storage", "sidePanel", "nativeMessaging"],
        // No host_permissions — extension never touches web pages
        content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'none';",
        },
        side_panel: {
            default_path: "sidepanel/index.html",
        },
        action: {
            default_popup: "popup/index.html",
        },
        options_ui: {
            page: "options/index.html",
            open_in_tab: true,
        },
    },
});
