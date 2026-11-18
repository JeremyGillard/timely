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
  /** Past these (but within min/max) the value is allowed and shown as an overlap. */
  softMin?: number;
  softMax?: number;
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

// ---------- output ----------
let lastEmitted = model.value;
function emitValue(m: number) {
  const ms = Math.round(snap(m) * MIN);
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

function show(m: number) {
  pos.value = m;
  haptics(m);
  emitValue(m);
}

// ---------- spring ----------
let stopSpring: (() => void) | null = null;
const halt = () => {
  stopSpring?.();
  stopSpring = null;
};
function settleTo(target: number, velocity = 0, bouncy = false) {
  halt();
  if (prefersReducedMotion() || target === pos.value) return show(target);
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
  const m = banded(raw);
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
  const target = snap(projected);
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
  wheelTimer = setTimeout(() => settleTo(snap(pos.value)), 120);
}

// ---------- keyboard ----------
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 5 : 1;
  const base = Math.round(pos.value);
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
  const out: {
    m: number;
    major: boolean;
    out: boolean;
    overlap: boolean;
    text: string | null;
  }[] = [];
  const softLo = props.softMin === undefined ? -Infinity : props.softMin / MIN;
  const softHi = props.softMax === undefined ? Infinity : props.softMax / MIN;
  for (let m = center.value - VISIBLE; m <= center.value + VISIBLE; m++) {
    const major = m % 5 === 0;
    out.push({
      m,
      major,
      out: m < Math.ceil(lo.value) || m > Math.floor(hi.value),
      overlap: m < softLo || m > softHi,
      text: major ? clock(m * MIN) : null,
    });
  }
  return out;
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
        :class="{ major: t.major, out: t.out, overlap: t.overlap }"
        :style="{ left: `${(t.m - anchor) * PX}px` }"
      >
        <span v-if="t.text" class="label">{{ t.text }}</span>
      </span>
    </div>
    <span class="needle" aria-hidden="true" />
  </div>
</template>

<style scoped>
.scrubber {
  position: relative;
  height: 64px;
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
.tick.overlap {
  background: var(--warning);
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
</style>
