// https://nuxt.com/docs/api/configuration/nuxt-config

// "/" locally; "/timely/" on GitHub Pages (set by the deploy workflow).
const baseURL = process.env.NUXT_APP_BASE_URL ?? "/";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  modules: ["@vite-pwa/nuxt"],
  // Service worker: precaches the generated site (works offline) and, when a deploy lands,
  // installs the new version in the background → "Update available" toast (app/app.vue).
  pwa: {
    registerType: "prompt",
    manifest: {
      name: "Timely",
      short_name: "Timely",
      description: "Track time windows with a tap.",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f1f1ee",
      theme_color: "#f1f1ee",
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      ],
    },
    generateSW: {
      globPatterns: ["**/*.{js,css,html,png,svg,ico,txt}"],
      // /week?week=… must still hit the precached /week page
      ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^week$/],
      // control the page from the first visit, so "Reload" (which waits for the new worker
      // to take control) also works in the session where the app was first opened
      clientsClaim: true,
    },
    client: { periodicSyncForUpdates: 3600 }, // also re-checked on every foreground (plugins/pwa-update)
    devOptions: { enabled: false },
  },
  app: {
    baseURL,
    head: {
      htmlAttrs: { lang: "en" },
      // viewport-fit=cover: draw under the notch / home indicator (padded via safe-area insets in CSS)
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "theme-color", content: "#f1f1ee" },
        // Home-screen app (iOS + Android)
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "Timely" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      ],
      // head links aren't prefixed by Nuxt, so add the base path ourselves
      link: [
        { rel: "icon", type: "image/svg+xml", href: `${baseURL}icon.svg` },
        { rel: "apple-touch-icon", href: `${baseURL}apple-touch-icon.png` },
      ],
    },
  },
});
