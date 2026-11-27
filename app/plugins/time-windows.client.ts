// Load saved data once at startup so every page (Track, Week, Stats) sees it, then start
// background sync (a no-op unless the user turned it on).
export default defineNuxtPlugin(() => {
  useLedger().load(); // first: the stores record into it while loading
  useTimeWindows().load();
  useSettings().load();
  useSync().start();
});
