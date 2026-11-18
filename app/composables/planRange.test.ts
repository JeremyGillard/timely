import { describe, expect, it } from "vite-plus/test";
import { planRange, type TimeWindow } from "./useTimeWindows";

const M = 60_000;
const NOW = 1_000 * M;
const w = (id: string, s: number, e: number | null): TimeWindow => ({
  id,
  start: s * M,
  end: e === null ? null : e * M,
});
const ws = [w("a", 100, 200), w("b", 300, 400), w("c", 900, null)];
const plan = (s: number, e: number) => {
  const p = planRange(ws, s * M, e * M, NOW);
  return {
    trims: p.trims.map((t) => [t.window.id, t.start / M, t.end === null ? null : t.end / M]),
    conflicts: p.conflicts.map((x) => x.id),
  };
};

describe("planRange", () => {
  it("is empty in a free gap, even touching edges", () => {
    expect(plan(200, 300)).toEqual({ trims: [], conflicts: [] });
  });
  it("can go before the first window", () => {
    expect(plan(10, 50)).toEqual({ trims: [], conflicts: [] });
  });
  it("trims the tail of the window before and the head of the one after", () => {
    expect(plan(150, 350)).toEqual({
      trims: [
        ["a", 100, 150],
        ["b", 350, 400],
      ],
      conflicts: [],
    });
  });
  it("trims the head of a running window, keeping it running", () => {
    expect(plan(800, 950)).toEqual({ trims: [["c", 950, null]], conflicts: [] });
  });
  it("conflicts when swallowing a window or sitting inside one", () => {
    expect(plan(50, 250).conflicts).toEqual(["a"]);
    expect(plan(120, 180).conflicts).toEqual(["a"]);
  });
  it("conflicts when a trim would leave less than a minute", () => {
    expect(plan(100.5, 250).conflicts).toEqual(["a"]);
  });
  it("ignores the excluded window", () => {
    expect(planRange(ws, 120 * M, 180 * M, NOW, "a")).toEqual({ trims: [], conflicts: [] });
  });
});
