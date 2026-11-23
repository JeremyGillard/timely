// A home-screen app can sit suspended for days and just resume, never reloading. So each
// time it comes back to the foreground, ask the service worker to look for a new deploy
// (throttled); if one exists it installs in the background and the update toast shows.
const MIN_GAP_MS = 60_000;

export default defineNuxtPlugin((nuxtApp) => {
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = 0;

  nuxtApp.hook("service-worker:registered", ({ registration: r }) => {
    registration = r;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !registration || !navigator.onLine) return;
    if (Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {}); // offline / flaky network: try again next time
  });
});
