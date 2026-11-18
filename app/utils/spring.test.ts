import { describe, expect, it } from "vite-plus/test";
import { project, rubberband, stepSpring, type SpringState } from "./spring";

function settle(from: number, to: number, velocity: number, damping: number, response = 0.35) {
  let s: SpringState = { x: from, v: velocity };
  let maxX = from;
  for (let i = 0; i < 240 * 3; i++) {
    s = stepSpring(s, to, 1 / 240, damping, response);
    maxX = Math.max(maxX, s.x);
  }
  return { ...s, maxX };
}

describe("project", () => {
  it("is zero without velocity and signed with it", () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(-1000)).toBeCloseTo(-499, 0);
  });
  it("travels less with a lower deceleration rate", () => {
    expect(project(1000, 0.99)).toBeLessThan(project(1000, 0.998));
  });
});

describe("rubberband", () => {
  it("follows almost 1:1 near the edge and saturates far out", () => {
    expect(rubberband(0, 100)).toBe(0);
    expect(rubberband(1, 100)).toBeCloseTo(0.55, 1);
    expect(rubberband(10_000, 100)).toBeLessThan(100);
    expect(rubberband(-50, 100)).toBe(-rubberband(50, 100));
  });
});

describe("stepSpring", () => {
  it("settles on the target within 3 s", () => {
    const s = settle(0, 10, 0, 1);
    expect(s.x).toBeCloseTo(10, 3);
    expect(Math.abs(s.v)).toBeLessThan(0.01);
  });
  it("does not overshoot when critically damped, even with velocity toward the target", () => {
    expect(settle(0, 10, 20, 1).maxX).toBeLessThan(10.5);
  });
  it("overshoots when under-damped", () => {
    expect(settle(0, 10, 0, 0.5).maxX).toBeGreaterThan(10.5);
  });
});
