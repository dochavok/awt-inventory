import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { helpPages } from "./build/help-pages";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    // DOC-1: the user guide in docs/, built into the app.
    helpPages(fileURLToPath(new URL(".", import.meta.url))),
    // NF-3, DOC-1: the app and its help pages are stored on the phone, so they open without signal.
    // The manifest is our own (public/manifest.webmanifest, NF-2).
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "inline",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        navigateFallback: "index.html",
        // Firebase's own pages (Google sign-in's /__/auth/handler) must reach Hosting, never the app.
        navigateFallbackDenylist: [/^\/__\//],
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
