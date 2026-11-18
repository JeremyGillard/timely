export interface TimeWindow {
  id: string;
  start: number; // epoch ms
  end: number | null; // null = running
  note?: string; // optional label / note
  tags?: string[]; // Tag ids; omitted when empty
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

// Muted hues, legible as dots and as tinted chip backgrounds.
const TAG_COLORS = [
  "#5b8def",
  "#e0864a",
  "#4fae7b",
  "#c25d9b",
  "#8a6fd6",
  "#d4a72c",
  "#3fa6b5",
  "#d9574f",
];

// Prototype persistence: plain localStorage. Move into the encrypted vault later.
const STORAGE_KEY = "timesheet-windows";
const TAGS_KEY = "timesheet-tags";

export function useTimeWindows() {
  const windows = useState<TimeWindow[]>("time-windows", () => []);
  const tags = useState<Tag[]>("time-window-tags", () => []);
  const active = computed(() => windows.value.find((w) => w.end === null) ?? null);

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows.value));
      localStorage.setItem(TAGS_KEY, JSON.stringify(tags.value));
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
    try {
      const raw = localStorage.getItem(TAGS_KEY);
      if (raw) tags.value = JSON.parse(raw) as Tag[];
    } catch {
      tags.value = [];
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

  /** Edges of the windows right before and after this one (the limits it may not cross). */
  function boundsFor(id: string): { prevEnd: number | null; nextStart: number | null } {
    const self = windows.value.find((w) => w.id === id);
    if (!self) return { prevEnd: null, nextStart: null };
    let prevEnd: number | null = null;
    let nextStart: number | null = null;
    for (const w of windows.value) {
      if (w.id === id) continue;
      if (w.start < self.start) prevEnd = Math.max(prevEnd ?? -Infinity, w.end ?? Date.now());
      else nextStart = Math.min(nextStart ?? Infinity, w.start);
    }
    return { prevEnd, nextStart };
  }

  /** Moves a window's start/end, clamped so it never overlaps its neighbours or the future. */
  function setTimes(id: string, start: number, end: number | null) {
    const { prevEnd, nextStart } = boundsFor(id);
    const now = Date.now();
    const s = Math.max(start, prevEnd ?? -Infinity);
    const e = end === null ? null : Math.min(end, nextStart ?? Infinity, now);
    if (s >= (e ?? now)) return; // invalid: keep the window as it was
    windows.value = windows.value.map((w) => (w.id === id ? { ...w, start: s, end: e } : w));
    persist();
  }

  /** Creates a tag, or returns the existing one with the same name (case-insensitive). */
  function createTag(name: string): Tag | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = tags.value.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: trimmed,
      color: TAG_COLORS[tags.value.length % TAG_COLORS.length]!,
    };
    tags.value = [...tags.value, tag];
    persist();
    return tag;
  }

  function renameTag(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    tags.value = tags.value.map((t) => (t.id === id ? { ...t, name: trimmed } : t));
    persist();
  }

  /** Deletes a tag and strips it from every window. */
  function deleteTag(id: string) {
    tags.value = tags.value.filter((t) => t.id !== id);
    windows.value = windows.value.map((w) =>
      w.tags?.includes(id)
        ? withTags(
            w,
            w.tags.filter((x) => x !== id),
          )
        : w,
    );
    persist();
  }

  /** Adds the tag to the window, or removes it if already there. Returns true if now tagged. */
  function toggleTag(windowId: string, tagId: string): boolean {
    let tagged = false;
    windows.value = windows.value.map((w) => {
      if (w.id !== windowId) return w;
      const current = w.tags ?? [];
      tagged = !current.includes(tagId);
      return withTags(w, tagged ? [...current, tagId] : current.filter((x) => x !== tagId));
    });
    persist();
    return tagged;
  }

  return {
    windows,
    tags,
    active,
    load,
    next,
    stop,
    remove,
    setNote,
    restore,
    boundsFor,
    setTimes,
    createTag,
    renameTag,
    deleteTag,
    toggleTag,
  };
}

function withTags(w: TimeWindow, ids: string[]): TimeWindow {
  const { tags: _old, ...rest } = w;
  return ids.length ? { ...rest, tags: ids } : rest;
}
