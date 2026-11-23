// Time formatting + calendar helpers shared by the pages.

const DAY_MS = 86_400_000;

/** HH:MM:SS (hours not capped at 24). */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** HH:MM (hours not capped at 24). */
export function hoursMinutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Local wall-clock time, e.g. 14:05. */
export const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Local midnight of the given instant. */
export const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0);

/** Calendar-safe day shift (handles DST: days aren't always 24 h). */
export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Monday 00:00 of the week containing `ms` (ISO weeks, Monday first). */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const sinceMonday = (d.getDay() + 6) % 7; // getDay: 0 = Sunday
  return addDays(d.getTime(), -sinceMonday);
}

/** Splits [start, end) into per-day chunks so windows crossing midnight count on both days. */
export function splitByDay(start: number, end: number): { day: number; ms: number }[] {
  const chunks: { day: number; ms: number }[] = [];
  let cursor = start;
  // guard against corrupt data producing huge loops
  for (let i = 0; cursor < end && i < 400; i++) {
    const day = startOfDay(cursor);
    const next = Math.min(end, addDays(day, 1));
    chunks.push({ day, ms: next - cursor });
    cursor = next;
  }
  return chunks;
}

/** Local date of a week's Monday as "YYYY-MM-DD" (URL param for the selected week). */
export function weekParam(ms: number): string {
  const d = new Date(startOfWeek(ms));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday 00:00 of the week named by a "YYYY-MM-DD" param; invalid, missing or future → current week. */
export function parseWeekParam(param: unknown, now: number): number {
  const current = startOfWeek(now);
  if (typeof param !== "string") return current;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (!m) return current;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return current;
  return Math.min(startOfWeek(date.getTime()), current);
}

/** ISO-8601 week number (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeek(ms: number): number {
  const thursday = new Date(addDays(startOfWeek(ms), 3));
  const jan1 = new Date(thursday.getFullYear(), 0, 1).getTime();
  return Math.floor(Math.round((thursday.getTime() - jan1) / DAY_MS) / 7) + 1;
}

/** "This week" / "Last week" / "Week 46". */
export function weekLabel(weekStart: number, now: number): string {
  const current = startOfWeek(now);
  if (weekStart === current) return "This week";
  if (weekStart === addDays(current, -7)) return "Last week";
  return `Week ${isoWeek(weekStart)}`;
}

export { DAY_MS };

/**
 * Suggested range for a manually added window today, never overlapping existing ones:
 * the most recent untracked gap (≥ 1 min; its last 30 min if longer), else the 30 min
 * before today's first window, else the last 30 min. Rounded to whole minutes.
 */
export function defaultRange(
  windows: readonly { start: number; end: number | null }[],
  now: number,
  length = 30 * 60_000,
): { start: number; end: number } {
  const MIN = 60_000;
  const floorMin = (ms: number) => Math.floor(ms / MIN) * MIN;
  const ceilMin = (ms: number) => Math.ceil(ms / MIN) * MIN;
  const dayStart = startOfDay(now);
  const today = windows
    .filter((w) => (w.end ?? now) > dayStart)
    .toSorted((a, b) => a.start - b.start);
  if (!today.length) return { start: floorMin(now) - length, end: floorMin(now) };

  // gaps between consecutive windows, plus the one up to now if nothing is running
  const gaps: { start: number; end: number }[] = [];
  let cursor = Math.max(dayStart, today[0]!.start);
  for (const w of today) {
    if (w.start > cursor) gaps.push({ start: cursor, end: w.start });
    cursor = Math.max(cursor, w.end ?? now);
  }
  if (cursor < now) gaps.push({ start: cursor, end: now });

  for (const g of gaps.toReversed()) {
    const start = ceilMin(g.start);
    const end = floorMin(g.end);
    if (end - start >= MIN) return { start: Math.max(start, end - length), end };
  }
  const first = floorMin(today[0]!.start);
  return { start: first - length, end: first };
}
