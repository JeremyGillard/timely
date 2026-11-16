<script setup lang="ts">
// Three concentric dotted rings (dots = zero-length dashes with round caps).
//
// Idle (no `startedAt`): slow decorative CSS spin (outer ring black, inner rings grey).
// Running (`startedAt` = window start, epoch ms): each ring is a gauge filling clockwise from 12 o'clock,
//   outer = seconds (fills every minute), middle = minutes (every hour), inner = hours (every 12 h).
//   Filled dots are black, the rest grey; a marker rides the head of the fill.
//   Driven by the Web Animations API so a new window can smoothly rewind to 0 and then resume.
const props = defineProps<{ startedAt?: number }>();

const REWIND_MS = 700;
const REWIND_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

const uid = useId();

const rings = [
  {
    r: 180,
    dots: 72,
    size: 5,
    idleColor: "var(--ink)",
    spin: "spin-cw",
    period: 60_000,
    marker: { r: 9, fill: "var(--accent)" },
  },
  {
    r: 160,
    dots: 64,
    size: 4,
    idleColor: "var(--dot-light)",
    spin: "spin-ccw",
    period: 3_600_000,
    marker: { r: 6, fill: "var(--ink)" },
  },
  {
    r: 140,
    dots: 56,
    size: 3,
    idleColor: "var(--dot-light)",
    spin: "spin-cw-slow",
    period: 43_200_000,
    marker: { r: 5, fill: "var(--ink)" },
  },
].map((ring, i) => ({
  ...ring,
  gap: (2 * Math.PI * ring.r) / ring.dots,
  maskId: `${uid}-fill-${i}`,
}));

const running = computed(() => props.startedAt !== undefined);

// ---------- animation ----------

const markerEls: (SVGGElement | null)[] = [];
const arcEls: (SVGCircleElement | null)[] = [];
let anims: Animation[] = [];
let generation = 0; // invalidates pending rewinds on rapid taps

const turn = (deg: number) => ({ transform: `rotate(${deg}deg)` });
const fill = (progress: number) => ({ strokeDashoffset: 100 * (1 - progress) });

function stopAll() {
  for (const a of anims) a.cancel();
  anims = [];
}

/** Progress (0..1) currently shown by ring i, read from the live computed style. */
function shownProgress(i: number): number {
  const el = markerEls[i];
  if (!el) return 0;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = new DOMMatrix(t);
  const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return (((deg % 360) + 360) % 360) / 360;
}

function startClock(start: number) {
  stopAll();
  const elapsed = Math.max(0, Date.now() - start);
  rings.forEach((ring, i) => {
    const marker = markerEls[i];
    const arc = arcEls[i];
    if (!marker || !arc) return;
    const opts = { duration: ring.period, iterations: Infinity };
    const spin = marker.animate([turn(0), turn(360)], opts);
    const grow = arc.animate([fill(0), fill(1)], opts);
    spin.currentTime = grow.currentTime = elapsed % ring.period;
    anims.push(spin, grow);
  });
}

/** Smoothly winds every ring back towards 0, landing where the new window will be, then resumes. */
function rewindTo(start: number) {
  const gen = ++generation;
  const from = rings.map((_, i) => shownProgress(i));
  stopAll();
  const landing = Date.now() - start + REWIND_MS;
  const opts = { duration: REWIND_MS, easing: REWIND_EASING, fill: "forwards" as const };
  rings.forEach((ring, i) => {
    const marker = markerEls[i];
    const arc = arcEls[i];
    if (!marker || !arc) return;
    const to = (landing % ring.period) / ring.period;
    const p = from[i] ?? 0;
    anims.push(
      marker.animate([turn(p * 360), turn(to * 360)], opts),
      arc.animate([fill(p), fill(to)], opts),
    );
  });
  Promise.all(anims.map((a) => a.finished))
    .then(() => {
      if (gen === generation) startClock(start);
    })
    .catch(() => {
      // cancelled by a newer tap / stop — nothing to do
    });
}

watch(
  () => props.startedAt,
  (next, prev) => {
    generation++;
    if (next === undefined) stopAll(); // stopped → idle template
    else if (prev === undefined) startClock(next); // idle → first window
    else rewindTo(next); // new window while running
  },
  { flush: "post" }, // DOM for the running template exists before we animate it
);

onMounted(() => {
  if (props.startedAt !== undefined) startClock(props.startedAt);
});
onBeforeUnmount(stopAll);
</script>

<template>
  <div class="rings">
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <template v-for="(ring, i) in rings" :key="ring.r">
        <!-- Idle: decorative spinning ring -->
        <g v-if="!running" :class="ring.spin">
          <circle
            cx="200"
            cy="200"
            :r="ring.r"
            fill="none"
            :stroke="ring.idleColor"
            :stroke-width="ring.size"
            stroke-linecap="round"
            :stroke-dasharray="`0 ${ring.gap}`"
          />
          <circle
            cx="200"
            :cy="200 - ring.r"
            :r="ring.marker.r"
            :fill="ring.marker.fill"
            stroke="var(--ink)"
            stroke-width="2"
          />
        </g>

        <!-- Running: static grey track + black dots revealed by a growing arc mask -->
        <g v-else>
          <mask :id="ring.maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
            <circle
              :ref="(el) => (arcEls[i] = el as SVGCircleElement | null)"
              class="fill-arc"
              cx="200"
              cy="200"
              :r="ring.r"
              fill="none"
              stroke="#fff"
              stroke-width="16"
              pathLength="100"
            />
          </mask>
          <circle
            v-for="(color, j) in ['var(--dot-light)', 'var(--ink)']"
            :key="j"
            cx="200"
            cy="200"
            :r="ring.r"
            fill="none"
            :stroke="color"
            :stroke-width="ring.size"
            stroke-linecap="round"
            :stroke-dasharray="`0 ${ring.gap}`"
            :mask="j === 1 ? `url(#${ring.maskId})` : undefined"
          />
          <g :ref="(el) => (markerEls[i] = el as SVGGElement | null)">
            <circle
              cx="200"
              :cy="200 - ring.r"
              :r="ring.marker.r"
              :fill="ring.marker.fill"
              stroke="var(--ink)"
              stroke-width="2"
            />
          </g>
        </g>
      </template>
    </svg>
    <div class="center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.rings {
  position: relative;
  width: min(85vw, 420px);
  aspect-ratio: 1;
}
svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
g {
  transform-origin: 200px 200px;
}
/* Arc mask: starts at 12 o'clock; dashoffset 100 = empty, 0 = full (animated from script). */
.fill-arc {
  transform-origin: 200px 200px;
  transform: rotate(-90deg);
  stroke-dasharray: 100 100;
  stroke-dashoffset: 100;
}

.spin-cw {
  animation: spin 120s linear infinite;
}
.spin-ccw {
  animation: spin 160s linear infinite reverse;
}
.spin-cw-slow {
  animation: spin 200s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
/* Reduced motion: drop the decorative idle spin; the clock rings carry information, keep them. */
@media (prefers-reduced-motion: reduce) {
  .spin-cw,
  .spin-ccw,
  .spin-cw-slow {
    animation: none;
  }
}
.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
</style>
