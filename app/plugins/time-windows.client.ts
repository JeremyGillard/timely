// Load saved time windows once at startup so every page (Track, Week, Stats) sees them.
export default defineNuxtPlugin(() => {
  useTimeWindows().load();
  useSettings().load();
});
