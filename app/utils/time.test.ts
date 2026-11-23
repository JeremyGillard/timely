import { describe, expect, it } from "vite-plus/test";
import { defaultRange, isoWeek, parseWeekParam, weekLabel, weekParam } from "./time";

const M = 60_000;
// 2026-11-18 14:00 local, well clear of midnight
const NOW = new Date(2026, 10, 18, 14, 0, 0).getTime();
const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m).getTime();

describe("defaultRange", () => {
  it("uses the last 30 min when there are no windows today", () => {
    expect(defaultRange([], NOW)).toEqual({ start: NOW - 30 * M, end: NOW });
  });

  it("ignores windows from previous days", () => {
    const yesterday = { start: at(9) - 86_400_000, end: at(10) - 86_400_000 };
    expect(defaultRange([yesterday], NOW)).toEqual({ start: NOW - 30 * M, end: NOW });
  });

  it("fills a short gap between windows exactly", () => {
    const ws = [
      { start: at(9), end: at(10) },
      { start: at(10, 20), end: null },
    ];
    expect(defaultRange(ws, NOW)).toEqual({ start: at(10), end: at(10, 20) });
  });

  it("prefers the most recent gap: the one up to now when nothing runs", () => {
    const ws = [
      { start: at(9), end: at(10) },
      { start: at(10, 20), end: at(13, 50) },
    ];
    expect(defaultRange(ws, NOW)).toEqual({ start: at(13, 50), end: NOW });
  });

  it("takes the last 30 min of a long gap", () => {
    const ws = [{ start: at(9), end: at(11) }];
    expect(defaultRange(ws, NOW)).toEqual({ start: NOW - 30 * M, end: NOW });
  });

  it("rounds inward to whole minutes and skips gaps under a minute", () => {
    const ws = [
      { start: at(9), end: at(10) + 10_000 },
      { start: at(10) + 40_000, end: null }, // 30 s gap
    ];
    expect(defaultRange(ws, NOW)).toEqual({ start: at(8, 30), end: at(9) });
  });

  it("goes before the first window when one has been running since", () => {
    const ws = [{ start: at(9, 15), end: null }];
    expect(defaultRange(ws, NOW)).toEqual({ start: at(8, 45), end: at(9, 15) });
  });
});

describe("week param", () => {
  const MON = new Date(2026, 10, 16).getTime();

  it("formats the Monday of the week as YYYY-MM-DD", () => {
    expect(weekParam(NOW)).toBe("2026-11-16");
  });

  it("parses any day to its Monday, round-tripping", () => {
    expect(parseWeekParam("2026-11-12", NOW)).toBe(new Date(2026, 10, 9).getTime());
    expect(parseWeekParam(weekParam(MON - 86_400_000), NOW)).toBe(new Date(2026, 10, 9).getTime());
  });

  it("falls back to the current week for missing, invalid or future values", () => {
    for (const p of [undefined, "", "foo", "2026-02-30", ["2026-11-09"], "2027-01-04"])
      expect(parseWeekParam(p, NOW)).toBe(MON);
  });
});

describe("weekLabel / isoWeek", () => {
  it("names this and last week, numbers older ones", () => {
    const MON = new Date(2026, 10, 16).getTime();
    expect(weekLabel(MON, NOW)).toBe("This week");
    expect(weekLabel(new Date(2026, 10, 9).getTime(), NOW)).toBe("Last week");
    expect(weekLabel(new Date(2026, 10, 2).getTime(), NOW)).toBe("Week 45");
  });

  it("follows ISO numbering across year boundaries", () => {
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe(1); // Thu
    expect(isoWeek(new Date(2027, 0, 1).getTime())).toBe(53); // Fri → 2026-W53
    expect(isoWeek(new Date(2025, 11, 29).getTime())).toBe(1); // Mon → 2026-W01
  });
});
