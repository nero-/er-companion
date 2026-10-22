import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Elden Ring Definitive Companion",
        short_name: "ER Companion",
        description: "Offline-first route, collection, build, quest, and lore companion for Elden Ring.",
        theme_color: "#080706",
        background_color: "#080706",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,jpg,jpeg,png,webp}"],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024
      }
    })
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 6000
  }
});
