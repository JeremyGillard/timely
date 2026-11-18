<script setup lang="ts">
// Horizontal minute ruler. Drag 1:1, flick with momentum, rubber-bands past min/max,
// snaps to whole minutes with a velocity-carrying spring. Interruptible at any instant.
// Keyboard: ←/→ ±1 min, Shift ±5, PageUp/PageDown ±15, Home/End = bounds.
// Internally everything is in minutes (float); the model is epoch ms.

const PX = 12; // px per minute
const MIN = 60_000;
const VISIBLE = 32; // minutes rendered either side of the needle

const props = defineProps<{
  min: number;
  max: number;
  label: string;
  /** Other windows, drawn as grey blocks along the bottom of the ruler. */
  busy?: { start: number; end: number; label: string }[];
  /**
   * The window being edited, drawn as a block that follows the needle live:
   * "start" → [value, other], "end" → [other, value], "move" → [value, value + other (length)].
   */
  band?: { kind: "start" | "end" | "move"; other: number };
  /** The current placement can't be saved: overlap shown red instead of amber. */
  conflict?: boolean;
  /** Magnetic values (ms), e.g. where an edge meets another window: drags stick, flicks land. */
  snapPoints?: number[];
}>();
const model = defineModel<number>({ required: true });
const emit = defineEmits<{ limit: [side: "min" | "max"] }>();

const lo = computed(() => props.min / MIN);
const hi = computed(() => props.max / MIN);
const pos = ref(model.value / MIN); // live, presentation value (minutes)
const anchor = Math.floor(pos.value); // track origin; ticks are laid out relative to it

const clamp = (m: number) => Math.min(hi.value, Math.max(lo.value, m));
/** Nearest whole minute inside the bounds (a bound itself may sit between minutes). */
const snap = (m: number) => clamp(Math.round(m));

// ---------- magnetic snap points ----------
const DETENT = 0.75; // min: while dragging, the needle sticks this close to a point
const CATCH = 3; // min: a release / wheel settle landing this close goes to the point
/** Nearest snap point (minutes) within `radius` of m and inside the bounds, else null. */
function magnet(m: number, radius: number): number | null {
  let best: number | null = null;
  for (const ms of props.snapPoints ?? []) {
    const p = ms / MIN;
    if (p < lo.value || p > hi.value) continue;
    if (Math.abs(p - m) <= radius && (best === null || Math.abs(p - m) < Math.abs(best - m)))
      best = p;
  }
  return best;
}
/** Where to settle: a nearby snap point beats the nearest whole minute. */
const land = (m: number) => magnet(m, CATCH) ?? snap(m);
const snapped = computed(() => magnet(pos.value, 1e-6) !== null);
watch(snapped, (on) => {
  if (on) navigator.vibrate?.(8); // a "click" as it locks on
});

// ---------- output ----------
let lastEmitted = model.value;
function emitValue(m: number) {
  const exact = magnet(m, 1e-6); // sitting on a snap point: keep its exact ms (no gap)
  const ms = exact !== null ? Math.round(exact * MIN) : Math.round(snap(m) * MIN);
  if (ms !== lastEmitted) {
    lastEmitted = ms;
    model.value = ms;
  }
}

// haptic tick on each 5-minute line crossed (throttled), firmer bump at a bound
let lastTick = Math.floor(pos.value / 5);
let lastBuzz = 0;
function haptics(m: number) {
  const tick = Math.floor(m / 5);
  if (tick !== lastTick) {
    lastTick = tick;
    const t = performance.now();
    if (t - lastBuzz > 40) {
      navigator.vibrate?.(1);
      lastBuzz = t;
    }
  }
}
let atLimit: "min" | "max" | null = null;
function limit(side: "min" | "max" | null) {
  if (side && side !== atLimit) {
    navigator.vibrate?.(10);
    emit("limit", side);
  }
  atLimit = side;
}

// Value changed from outside (not by this ruler): jump there, unless the user is mid-gesture.
watch(model, (v) => {
  if (v === lastEmitted || dragging.value || stopSpring) return;
  lastEmitted = v;
  pos.value = v / MIN;
});

function show(m: number) {
  pos.value = m;
  haptics(m);
  emitValue(m);
}

// ---------- spring ----------
let stopSpring: (() => void) | null = null;
let springTarget = 0; // where the running spring is headed (keyboard steps build on it)
const halt = () => {
  stopSpring?.();
  stopSpring = null;
};
function settleTo(target: number, velocity = 0, bouncy = false) {
  halt();
  if (prefersReducedMotion() || target === pos.value) return show(target);
  springTarget = target;
  stopSpring = animateSpring({
    from: pos.value,
    to: target,
    velocity,
    damping: bouncy ? 0.85 : 1,
    response: 0.35,
    restDelta: 0.002,
    onUpdate: (x) => show(x),
    onDone: () => (stopSpring = null),
  });
}

// ---------- drag ----------
const el = ref<HTMLElement | null>(null);
const dragging = ref(false);
let startX = 0;
let startPos = 0;
let samples: { t: number; x: number }[] = [];

/** Raw (unbounded) value → displayed value, with rubber-banding past the bounds. */
function banded(raw: number) {
  const dim = (el.value?.clientWidth ?? 300) / PX;
  if (raw < lo.value) return lo.value - rubberband(lo.value - raw, dim);
  if (raw > hi.value) return hi.value + rubberband(raw - hi.value, dim);
  return raw;
}

function onDown(e: PointerEvent) {
  if (e.button !== 0) return;
  halt(); // interrupt: continue from the live, on-screen value
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  dragging.value = true;
  startX = e.clientX;
  startPos = pos.value;
  samples = [{ t: e.timeStamp, x: e.clientX }];
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return;
  samples.push({ t: e.timeStamp, x: e.clientX });
  if (samples.length > 6) samples.shift();
  const raw = startPos - (e.clientX - startX) / PX; // content moves with the finger
  const m = magnet(raw, DETENT) ?? banded(raw);
  limit(raw < lo.value ? "min" : raw > hi.value ? "max" : null);
  show(m);
}

function onUp(e: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  // release velocity from the last ~100 ms of samples (px/s → minutes/s)
  const recent = samples.filter((s) => e.timeStamp - s.t < 100);
  const first = recent[0];
  const last = recent.at(-1);
  const pxPerS =
    first && last && last.t > first.t ? ((last.x - first.x) / (last.t - first.t)) * 1000 : 0;
  const v = -pxPerS / PX;

  const projected = pos.value + project(-pxPerS, 0.995) / PX;
  const target = land(projected);
  if (projected < lo.value) limit("min");
  else if (projected > hi.value) limit("max");
  else limit(null);
  // out of bounds (rubber-banded) → no extra velocity into the wall
  const outside = pos.value < lo.value || pos.value > hi.value;
  settleTo(target, outside ? 0 : v, !outside && Math.abs(pxPerS) > 300);
}

function onCancel() {
  if (!dragging.value) return;
  dragging.value = false;
  settleTo(snap(pos.value));
}

// ---------- wheel / trackpad ----------
let wheelTimer: ReturnType<typeof setTimeout> | undefined;
function onWheel(e: WheelEvent) {
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!d) return;
  e.preventDefault();
  halt();
  const px = e.deltaMode === 1 ? d * 16 : d;
  const raw = pos.value + px / PX;
  limit(raw < lo.value ? "min" : raw > hi.value ? "max" : null);
  show(clamp(raw));
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => settleTo(land(pos.value)), 120);
}

// ---------- keyboard ----------
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 5 : 1;
  // repeated presses build on where the value is heading, not where the animation is now
  const base = stopSpring ? springTarget : Math.round(pos.value);
  let target: number | null = null;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") target = base + step;
  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") target = base - step;
  else if (e.key === "PageUp") target = base + 15;
  else if (e.key === "PageDown") target = base - 15;
  else if (e.key === "Home") target = lo.value;
  else if (e.key === "End") target = hi.value;
  if (target === null) return;
  e.preventDefault();
  limit(target < lo.value ? "min" : target > hi.value ? "max" : null);
  settleTo(snap(target));
}

onBeforeUnmount(() => {
  halt();
  clearTimeout(wheelTimer);
});

// ---------- render ----------
const center = computed(() => Math.round(pos.value));
const ticks = computed(() => {
  const out: { m: number; major: boolean; out: boolean; text: string | null }[] = [];
  for (let m = center.value - VISIBLE; m <= center.value + VISIBLE; m++) {
    const major = m % 5 === 0;
    out.push({
      m,
      major,
      out: m < Math.ceil(lo.value) || m > Math.floor(hi.value),
      text: major ? clock(m * MIN) : null,
    });
  }
  return out;
});
// Blocks (minutes, clipped to what's rendered so 24 h-wide windows stay cheap)
const view = computed(() => [center.value - VISIBLE - 2, center.value + VISIBLE + 2] as const);
const place = (a: number, b: number) => {
  const [v0, v1] = view.value;
  const s = Math.max(a, v0);
  const e = Math.min(b, v1);
  return e > s ? { left: `${(s - anchor) * PX}px`, width: `${(e - s) * PX}px` } : null;
};
const busyBlocks = computed(() =>
  (props.busy ?? []).flatMap((w) => {
    const style = place(w.start / MIN, w.end / MIN);
    // label only when the block is wide enough to hold it
    return style
      ? [{ key: w.start, style, label: (w.end - w.start) / MIN >= 8 ? w.label : "" }]
      : [];
  }),
);
const self = computed(() => {
  const b = props.band;
  if (!b) return null;
  const other = b.other / MIN;
  const p = pos.value;
  return b.kind === "start" ? [p, other] : b.kind === "end" ? [other, p] : [p, p + other];
});
const selfBlock = computed(() => (self.value ? place(self.value[0]!, self.value[1]!) : null));
/** Where the edited window covers another one. */
const overlapBlocks = computed(() => {
  const s = self.value;
  if (!s) return [];
  return (props.busy ?? []).flatMap((w) => {
    const style = place(Math.max(s[0]!, w.start / MIN), Math.min(s[1]!, w.end / MIN));
    return style ? [{ key: w.start, style }] : [];
  });
});

const trackStyle = computed(() => ({ transform: `translateX(${-(pos.value - anchor) * PX}px)` }));
const valueText = computed(() => `${props.label} ${clock(model.value)}`);
</script>

<template>
  <div
    ref="el"
    class="scrubber"
    :class="{ dragging }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="model"
    :aria-valuetext="valueText"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onCancel"
    @wheel="onWheel"
    @keydown="onKey"
  >
    <div class="track" :style="trackStyle">
      <span
        v-for="t in ticks"
        :key="t.m"
        class="tick"
        :class="{ major: t.major, out: t.out }"
        :style="{ left: `${(t.m - anchor) * PX}px` }"
      >
        <span v-if="t.text" class="label">{{ t.text }}</span>
      </span>
      <span v-for="b in busyBlocks" :key="b.key" class="block busy" :style="b.style">
        {{ b.label }}
      </span>
      <span v-if="selfBlock" class="block self" :style="selfBlock" />
      <span
        v-for="o in overlapBlocks"
        :key="`o${o.key}`"
        class="block overlap"
        :class="{ conflict }"
        :style="o.style"
      />
    </div>
    <span class="needle" :class="{ snapped }" aria-hidden="true" />
  </div>
</template>

<style scoped>
.scrubber {
  position: relative;
  height: 76px;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--dot-light);
  cursor: grab;
  touch-action: none; /* we own horizontal and vertical drags here */
  user-select: none;
  -webkit-user-select: none;
  /* fade ticks out toward the edges */
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
}
.scrubber.dragging {
  cursor: grabbing;
}
.scrubber:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.track {
  position: absolute;
  inset: 0 auto 0 50%;
  will-change: transform;
}
.tick {
  position: absolute;
  top: 10px;
  width: 1px;
  height: 12px;
  margin-left: -0.5px;
  background: var(--dot-light);
}
.tick.major {
  height: 20px;
  background: var(--muted);
}
.block {
  position: absolute;
  bottom: 8px;
  height: 16px;
  border-radius: 5px;
  overflow: hidden;
  padding: 0 6px;
  font-size: 0.65rem;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
/* other windows: neutral, quiet */
.block.busy {
  background: color-mix(in srgb, var(--muted) 28%, #fff);
  color: color-mix(in srgb, var(--muted) 60%, var(--ink));
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
}
/* the window being edited: the accent, it's "yours" */
.block.self {
  background: var(--accent);
  box-shadow: inset 0 0 0 1.5px var(--ink);
  opacity: 0.9;
}
/* collision: striped amber (will be trimmed) or red (can't save) */
.block.overlap {
  --c: var(--warning);
  background: repeating-linear-gradient(
    -45deg,
    var(--c) 0 4px,
    color-mix(in srgb, var(--c) 45%, #fff) 4px 8px
  );
  box-shadow: inset 0 0 0 1.5px var(--ink);
}
.block.overlap.conflict {
  --c: var(--danger);
}
.tick.out {
  opacity: 0.3;
}
.label {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.72rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.needle {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--ink);
  pointer-events: none;
}
.needle.snapped {
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 80%, transparent);
}
.needle {
  transition:
    width 0.12s ease-out,
    margin 0.12s ease-out,
    box-shadow 0.12s ease-out;
}
</style>
