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

export { DAY_MS };
