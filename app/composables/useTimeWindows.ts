export interface TimeWindow {
  id: string;
  start: number; // epoch ms
  end: number | null; // null = running
  note?: string; // optional label / note
}

// Prototype persistence: plain localStorage. Move into the encrypted vault later.
const STORAGE_KEY = "timesheet-windows";

export function useTimeWindows() {
  const windows = useState<TimeWindow[]>("time-windows", () => []);
  const active = computed(() => windows.value.find((w) => w.end === null) ?? null);

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows.value));
    } catch {
      // storage unavailable (private mode, quota) — keep in memory only
    }
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) windows.value = JSON.parse(raw) as TimeWindow[];
    } catch {
      windows.value = [];
    }
  }

  const closeActive = (now: number) => {
    windows.value = windows.value.map((w) => (w.end === null ? { ...w, end: now } : w));
  };

  /** Starts a window; if one is running, closes it and starts the next. */
  function next() {
    const now = Date.now();
    closeActive(now);
    windows.value = [...windows.value, { id: crypto.randomUUID(), start: now, end: null }];
    persist();
  }

  /** Stops the running window. */
  function stop() {
    if (!active.value) return;
    closeActive(Date.now());
    persist();
  }

  /** Deletes a window (removing the running one also stops it). */
  function remove(id: string) {
    windows.value = windows.value.filter((w) => w.id !== id);
    persist();
  }

  /** Sets (or clears, when blank) the label/note of a window. */
  function setNote(id: string, note: string) {
    const trimmed = note.trim();
    windows.value = windows.value.map((w) => {
      if (w.id !== id) return w;
      const { note: _old, ...rest } = w;
      return trimmed ? { ...rest, note: trimmed } : rest;
    });
    persist();
  }

  /**
   * Puts a deleted window back (undo). If it was running but another window has been
   * started since, it's restored as stopped at the time it was deleted (never two running).
   */
  function restore(w: TimeWindow, deletedAt: number) {
    if (windows.value.some((x) => x.id === w.id)) return;
    const restored = w.end === null && active.value ? { ...w, end: deletedAt } : w;
    windows.value = [...windows.value, restored].sort((a, b) => a.start - b.start);
    persist();
  }

  return { windows, active, load, next, stop, remove, setNote, restore };
}
