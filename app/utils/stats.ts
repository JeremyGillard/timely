import { addDays, startOfWeek } from "./time";

// Pure aggregations for the Stats page. A window counts toward its first tag only
// (null = untagged), so per-tag totals add up to the overall total.

interface Win {
  start: number;
  end: number | null;
  tags?: string[];
}

/** Time per first tag (null = untagged) within [from, to); running windows count up to `now`. */
export function tagTotals(
  windows: readonly Win[],
  from: number,
  to: number,
  now: number,
): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const w of windows) {
    const ms = Math.min(w.end ?? now, to) - Math.max(w.start, from);
    if (ms <= 0) continue;
    const key = w.tags?.[0] ?? null;
    totals.set(key, (totals.get(key) ?? 0) + ms);
  }
  return totals;
}

/** Per first tag, time in each of the `weeks` weeks ending with the current one (oldest first). */
export function weeklyTagTrend(
  windows: readonly Win[],
  now: number,
  weeks = 8,
): { weekStarts: number[]; byTag: Map<string | null, number[]> } {
  const current = startOfWeek(now);
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(current, (i - weeks + 1) * 7));
  const byTag = new Map<string | null, number[]>();
  weekStarts.forEach((ws, i) => {
    for (const [tag, ms] of tagTotals(windows, ws, addDays(ws, 7), now)) {
      const row = byTag.get(tag) ?? Array.from({ length: weeks }, () => 0);
      row[i] = ms;
      byTag.set(tag, row);
    }
  });
  return { weekStarts, byTag };
}

export type Period = "week" | "month" | "all";

/** [from, to) for a period containing `now`; "all" starts at the earliest window. */
export function periodRange(
  period: Period,
  now: number,
  windows: readonly Win[],
): { from: number; to: number } {
  if (period === "week") {
    const from = startOfWeek(now);
    return { from, to: addDays(from, 7) };
  }
  if (period === "month") {
    const d = new Date(now);
    return {
      from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    };
  }
  const first = windows.reduce((m, w) => Math.min(m, w.start), now);
  return { from: first, to: now + 1 };
}
