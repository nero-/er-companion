import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Elden Ring Definitive Companion",
        short_name: "ER Companion",
        description: "Offline-first route, collection, build, quest, and lore companion for Elden Ring.",
        theme_color: "#0c0b09",
        background_color: "#0c0b09",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024
      }
    })
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000
  }
});
