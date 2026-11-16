export interface TimeWindow {
  id: string;
  start: number; // epoch ms
  end: number | null; // null = running
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

  return { windows, active, load, next, stop, remove };
}
