// Gesture physics (Apple "Designing Fluid Interfaces", WWDC 2018), dependency-free.
// Units are whatever the caller uses (px, minutes…); velocity is units per second.

/** Distance a flick travels before coming to rest (scroll-style exponential decay). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further out, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export interface SpringState {
  x: number;
  v: number;
}

/**
 * One integration step of a unit-mass spring, parameterised like Apple:
 * damping ratio ζ (1 = no overshoot) and response (s, ≈ period of the undamped oscillation).
 */
export function stepSpring(
  s: SpringState,
  to: number,
  dt: number,
  damping: number,
  response: number,
): SpringState {
  const k = ((2 * Math.PI) / response) ** 2;
  const c = (4 * Math.PI * damping) / response;
  const a = -k * (s.x - to) - c * s.v;
  const v = s.v + a * dt; // semi-implicit Euler: stable at small fixed steps
  return { x: s.x + v * dt, v };
}

export interface SpringOptions {
  from: number;
  to: number;
  velocity?: number;
  damping?: number;
  response?: number;
  /** Settle when both |x − to| and |v| fall below this (and |v| below 10×). */
  restDelta?: number;
  onUpdate: (x: number, v: number) => void;
  onDone?: () => void;
}

const STEP = 1 / 240; // fixed physics step, independent of display refresh rate

/** Runs a spring on requestAnimationFrame. Returns `stop()`; the last onUpdate value is the live one. */
export function animateSpring(o: SpringOptions): () => void {
  const damping = o.damping ?? 1;
  const response = o.response ?? 0.35;
  const rest = o.restDelta ?? 0.001;
  let s: SpringState = { x: o.from, v: o.velocity ?? 0 };
  let last = performance.now();
  let acc = 0;
  let raf = 0;

  const frame = (t: number) => {
    acc += Math.min(0.064, (t - last) / 1000); // clamp long frames (tab switch)
    last = t;
    while (acc >= STEP) {
      s = stepSpring(s, o.to, STEP, damping, response);
      acc -= STEP;
    }
    if (Math.abs(s.x - o.to) < rest && Math.abs(s.v) < rest * 10) {
      o.onUpdate(o.to, 0);
      o.onDone?.();
      return;
    }
    o.onUpdate(s.x, s.v);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
