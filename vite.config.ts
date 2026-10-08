import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 8080,
      host: "0.0.0.0",
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== "true",
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon-32.png",
          "favicon-16.png",
          "pwa-192.png",
          "favicon.png",
          "logo.jpeg",
        ],
        manifest: {
          name: "Task-Me Realty",
          short_name: "Task-Me",
          description: "Property & Tenant Management System",
          theme_color: "#9D1F15",
          background_color: "#F8F9FA",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "favicon-32.png", sizes: "32x32", type: "image/png" },
            { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: "favicon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        workbox: {
          // Cache all Vite-generated assets (JS chunks, CSS) with CacheFirst — they have content-hash names so they never go stale
          globPatterns: ["**/*.{js,css,html,svg,woff2}"],
          runtimeCaching: [
            {
              // Google Fonts stylesheets
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              // Google Fonts files
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              // Supabase API — NetworkFirst so data is always fresh; falls back to cache when offline
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-api-cache",
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // ── Vendor libraries ──────────────────────────────────────────
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/"))
              return "vendor-react";
            if (id.includes("node_modules/@tanstack")) return "vendor-query";
            if (id.includes("node_modules/@supabase")) return "vendor-supabase";
            if (id.includes("node_modules/chart.js") || id.includes("node_modules/react-chartjs-2"))
              return "vendor-charts";
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
    define: {
      "process.env.API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
