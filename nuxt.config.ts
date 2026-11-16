// https://nuxt.com/docs/api/configuration/nuxt-config

// "/" locally; "/timely/" on GitHub Pages (set by the deploy workflow).
const baseURL = process.env.NUXT_APP_BASE_URL ?? "/";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
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
        { rel: "manifest", href: `${baseURL}manifest.webmanifest` },
        { rel: "icon", type: "image/svg+xml", href: `${baseURL}icon.svg` },
        { rel: "apple-touch-icon", href: `${baseURL}apple-touch-icon.png` },
      ],
    },
  },
});
