import { describe, expect, it } from "vite-plus/test";
import { periodRange, tagTotals, weeklyTagTrend } from "./stats";

const H = 3_600_000;
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const NOW = at(18, 14); // Wed 18 Nov 2026, 14:00

describe("tagTotals", () => {
  it("counts each window toward its first tag only, untagged as null", () => {
    const t = tagTotals(
      [
        { start: at(16, 9), end: at(16, 11), tags: ["a", "b"] },
        { start: at(16, 13), end: at(16, 14), tags: ["b"] },
        { start: at(16, 15), end: at(16, 15, 30) },
      ],
      at(16, 0),
      at(17, 0),
      NOW,
    );
    expect(t.get("a")).toBe(2 * H);
    expect(t.get("b")).toBe(H);
    expect(t.get(null)).toBe(H / 2);
  });
  it("clips to the range and runs a live window up to now", () => {
    const t = tagTotals(
      [
        { start: at(15, 23), end: at(16, 1), tags: ["a"] },
        { start: at(18, 13), end: null, tags: ["a"] },
      ],
      at(16, 0),
      at(19, 0),
      NOW,
    );
    expect(t.get("a")).toBe(H + H);
  });
});

describe("weeklyTagTrend", () => {
  it("buckets per week, oldest first, ending with the current week", () => {
    const { weekStarts, byTag } = weeklyTagTrend(
      [
        { start: at(16, 9), end: at(16, 10), tags: ["a"] }, // this week
        { start: at(10, 9), end: at(10, 12), tags: ["a"] }, // last week
      ],
      NOW,
      3,
    );
    expect(weekStarts).toEqual([at(2, 0), at(9, 0), at(16, 0)]);
    expect(byTag.get("a")).toEqual([0, 3 * H, H]);
  });

  it("ends with the anchor's week when one is given", () => {
    const { weekStarts, byTag } = weeklyTagTrend(
      [
        { start: at(16, 9), end: at(16, 10), tags: ["a"] }, // after the anchor: ignored
        { start: at(10, 9), end: at(10, 12), tags: ["a"] },
      ],
      NOW,
      2,
      at(11, 0),
    );
    expect(weekStarts).toEqual([at(2, 0), at(9, 0)]);
    expect(byTag.get("a")).toEqual([0, 3 * H]);
  });
});

describe("periodRange", () => {
  it("week is Monday to Monday; month is the calendar month", () => {
    expect(periodRange("week", NOW, [])).toEqual({ from: at(16, 0), to: at(23, 0) });
    expect(periodRange("month", NOW, [])).toEqual({
      from: at(1, 0),
      to: new Date(2026, 11, 1).getTime(),
    });
  });
  it("all starts at the earliest window", () => {
    expect(periodRange("all", NOW, [{ start: at(3, 8), end: at(3, 9) }]).from).toBe(at(3, 8));
  });
});
