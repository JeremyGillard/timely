export interface TimeWindow {
  id: string;
  start: number; // epoch ms
  end: number | null; // null = running
  note?: string; // optional label / note
  tags?: string[]; // Tag ids; omitted when empty
}

export interface Neighbours {
  prev: TimeWindow | null;
  next: TimeWindow | null;
}

/** Shortest a window can be squeezed to by editing (it or a neighbour). */
export const MIN_WINDOW_MS = 60_000;

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
  /** Tags, most recently used first, then never-used ones. */
  const tagsByRecency = computed(() => {
    const seen = new Set<string>();
    for (let i = windows.value.length - 1; i >= 0; i--) {
      for (const id of windows.value[i]!.tags ?? []) seen.add(id);
    }
    const byId = new Map(tags.value.map((t) => [t.id, t]));
    const used = [...seen].map((id) => byId.get(id)).filter((t) => t !== undefined);
    return [...used, ...tags.value.filter((t) => !seen.has(t.id))];
  });
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

  /** The windows right before and after this one. */
  function neighboursOf(id: string): Neighbours {
    const self = windows.value.find((w) => w.id === id);
    return self ? neighboursAt(windows.value, self.start, id) : { prev: null, next: null };
  }

  /**
   * Moves a window's start/end. Overlapping a neighbour trims that neighbour (it keeps at
   * least MIN_WINDOW_MS); nothing may end in the future.
   */
  function setTimes(id: string, start: number, end: number | null) {
    const self = windows.value.find((w) => w.id === id);
    if (self && applyRange({ ...self, start, end })) persist();
  }

  /** Adds a finished window by hand (same overlap rules as editing). Returns its id, or null. */
  function add(w: { start: number; end: number; note?: string; tags?: string[] }): string | null {
    const id = crypto.randomUUID();
    const note = w.note?.trim();
    const created: TimeWindow = withTags(
      { id, start: w.start, end: w.end, ...(note ? { note } : {}) },
      w.tags ?? [],
    );
    const now = Date.now();
    if (created.end! > now || created.start >= created.end!) return null;
    const plan = planRange(windows.value, created.start, created.end!, now);
    if (plan.conflicts.length) return null;
    const trimmed = new Map(plan.trims.map((t) => [t.window.id, t]));
    windows.value = [
      ...windows.value.map((x) => {
        const t = trimmed.get(x.id);
        return t ? { ...x, start: t.start, end: t.end } : x;
      }),
      created,
    ].toSorted((a, b) => a.start - b.start);
    persist();
    return id;
  }

  /**
   * Writes `target` (new or existing) with its range clamped: it may overlap a neighbour, which
   * is trimmed (keeping ≥ MIN_WINDOW_MS), but never swallow one or end in the future.
   * Returns false (and changes nothing) if the clamped range is empty.
   */
  function applyRange(target: TimeWindow): boolean {
    const { id, start, end } = target;
    const { prev, next } = neighboursAt(windows.value, start, id);
    const now = Date.now();
    const s = Math.max(start, prev ? prev.start + MIN_WINDOW_MS : -Infinity);
    const e =
      end === null ? null : Math.min(end, now, next ? (next.end ?? now) - MIN_WINDOW_MS : Infinity);
    if (s >= (e ?? now)) return false;
    const updated = windows.value.map((w) => {
      if (w.id === id) return { ...target, start: s, end: e };
      if (w.id === prev?.id && (w.end ?? now) > s) return { ...w, end: s };
      if (w.id === next?.id && e !== null && w.start < e) return { ...w, start: e };
      return w;
    });
    if (!updated.some((w) => w.id === id)) updated.push({ ...target, start: s, end: e });
    windows.value = updated.toSorted((a, b) => a.start - b.start);
    return true;
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
    tagsByRecency,
    active,
    load,
    next,
    stop,
    remove,
    setNote,
    restore,
    neighboursOf,
    setTimes,
    add,
    createTag,
    renameTag,
    deleteTag,
    toggleTag,
  };
}

export interface RangePlan {
  /** Windows partly overlapped: they get shortened to these times. */
  trims: { window: TimeWindow; start: number; end: number | null }[];
  /** Windows that would be swallowed, or that contain the whole range: the range can't be used. */
  conflicts: TimeWindow[];
}

/** What placing [start, end) among `windows` would do to them. */
export function planRange(
  windows: readonly TimeWindow[],
  start: number,
  end: number,
  now: number,
  excludeId?: string,
): RangePlan {
  const plan: RangePlan = { trims: [], conflicts: [] };
  for (const w of windows) {
    if (w.id === excludeId) continue;
    const wEnd = w.end ?? now;
    if (wEnd <= start || w.start >= end) continue; // no overlap
    if (w.start < start && wEnd > end) plan.conflicts.push(w); // range sits inside it
    else if (w.start < start) {
      // overlaps its tail → it ends where the range starts
      if (start - w.start < MIN_WINDOW_MS) plan.conflicts.push(w);
      else plan.trims.push({ window: w, start: w.start, end: start });
    } else if (wEnd > end) {
      // overlaps its head → it starts where the range ends
      if (wEnd - end < MIN_WINDOW_MS) plan.conflicts.push(w);
      else plan.trims.push({ window: w, start: end, end: w.end });
    } else plan.conflicts.push(w); // swallowed whole
  }
  return plan;
}

/** prev = latest window starting before `start`, next = earliest starting at/after it. */
export function neighboursAt(
  windows: readonly TimeWindow[],
  start: number,
  excludeId?: string,
): Neighbours {
  let prev: TimeWindow | null = null;
  let next: TimeWindow | null = null;
  for (const w of windows) {
    if (w.id === excludeId) continue;
    if (w.start < start) {
      if (!prev || w.start > prev.start) prev = w;
    } else if (!next || w.start < next.start) next = w;
  }
  return { prev, next };
}

function withTags(w: TimeWindow, ids: string[]): TimeWindow {
  const { tags: _old, ...rest } = w;
  return ids.length ? { ...rest, tags: ids } : rest;
}
