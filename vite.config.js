import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        id: "./",
        name: "Implanta — Gestão de implantação",
        short_name: "Implanta",
        description:
          "Projetos municipais, homologação de dados migrados e organização da implantação.",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#254e40",
        icons: [
          {
            src: "icons/app-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/app-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/app-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cacheId: "implanta",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        globIgnores: ["**/icons/app-*.png"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\/assets\//, /\/icons\//],
      },
    }),
  ],
});
