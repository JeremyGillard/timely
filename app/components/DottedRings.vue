<script setup lang="ts">
// Three concentric dotted rings (dots = zero-length dashes with round caps).
//
// Idle (no `startedAt`): markers slowly orbit (decorative); outer track black, inner tracks grey.
// Running (`startedAt` = window start, epoch ms): each ring is a gauge filling clockwise from 12 o'clock,
//   outer = seconds (fills every minute), middle = minutes (every hour), inner = hours (every 12 h).
//   Filled dots are black, the rest grey; a marker rides the head of the fill.
//
// Every state change (first start, new window, stop) smoothly winds markers + fills back towards 0,
// then hands over to the next state's animation. All motion uses the Web Animations API.
const props = defineProps<{ startedAt?: number }>();

const TRANSITION_MS = 700;
const EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

const uid = useId();

const rings = [
  {
    r: 180,
    dots: 72,
    size: 5,
    idleColor: "var(--ink)",
    idleOrbit: 120_000, // ms per turn; sign = direction
    period: 60_000,
    marker: { r: 9, fill: "var(--accent)" },
  },
  {
    r: 160,
    dots: 64,
    size: 4,
    idleColor: "var(--dot-light)",
    idleOrbit: -160_000,
    period: 3_600_000,
    marker: { r: 6, fill: "var(--ink)" },
  },
  {
    r: 140,
    dots: 56,
    size: 3,
    idleColor: "var(--dot-light)",
    idleOrbit: 200_000,
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
let generation = 0; // invalidates pending transitions when the state changes again

const turn = (progress: number) => ({ transform: `rotate(${progress * 360}deg)` });
const fill = (progress: number) => ({ strokeDashoffset: 100 * (1 - progress) });

function stopAll() {
  for (const a of anims) a.cancel();
  anims = [];
}

/** What ring i currently shows (0..1 for marker turn and fill), read from live computed styles. */
function shown(i: number) {
  const marker = markerEls[i];
  const arc = arcEls[i];
  let t = 0;
  const transform = marker ? getComputedStyle(marker).transform : "none";
  if (transform && transform !== "none") {
    const m = new DOMMatrix(transform);
    const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    t = (((deg % 360) + 360) % 360) / 360;
  }
  const dash = arc ? parseFloat(getComputedStyle(arc).strokeDashoffset) : 100;
  return { turn: t, fill: Number.isFinite(dash) ? 1 - dash / 100 : 0 };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function startIdle() {
  stopAll();
  if (reducedMotion()) return;
  rings.forEach((ring, i) => {
    const a = markerEls[i]?.animate([turn(0), turn(Math.sign(ring.idleOrbit))], {
      duration: Math.abs(ring.idleOrbit),
      iterations: Infinity,
    });
    if (a) anims.push(a);
  });
}

function startClock(start: number) {
  stopAll();
  const elapsed = Math.max(0, Date.now() - start);
  rings.forEach((ring, i) => {
    const marker = markerEls[i];
    const arc = arcEls[i];
    if (!marker || !arc) return;
    const opts = { duration: ring.period, iterations: Infinity };
    const spin = marker.animate([turn(0), turn(1)], opts);
    const grow = arc.animate([fill(0), fill(1)], opts);
    spin.currentTime = grow.currentTime = elapsed % ring.period;
    anims.push(spin, grow);
  });
}

/**
 * Smoothly winds every ring from what it shows now back to `target(i)` (0..1),
 * then runs `then` (the next state's animation).
 */
function windTo(target: (i: number) => number, then: () => void) {
  const gen = ++generation;
  const from = rings.map((_, i) => shown(i));
  stopAll();
  const opts = { duration: TRANSITION_MS, easing: EASING, fill: "forwards" as const };
  rings.forEach((_, i) => {
    const marker = markerEls[i];
    const arc = arcEls[i];
    const f = from[i];
    if (!marker || !arc || !f) return;
    const to = target(i);
    anims.push(
      marker.animate([turn(f.turn), turn(to)], opts),
      arc.animate([fill(f.fill), fill(to)], opts),
    );
  });
  Promise.all(anims.map((a) => a.finished))
    .then(() => {
      if (gen === generation) then();
    })
    .catch(() => {
      // cancelled by a newer state change — nothing to do
    });
}

watch(
  () => props.startedAt,
  (start) => {
    if (start === undefined) {
      // stop: drain to 0, then the idle orbit resumes from 12 o'clock
      windTo(() => 0, startIdle);
      return;
    }
    // first start / new window: land where the window will be when the transition ends
    const landing = Date.now() - start + TRANSITION_MS;
    windTo(
      (i) => (landing % rings[i]!.period) / rings[i]!.period,
      () => startClock(start),
    );
  },
);

onMounted(() => {
  if (props.startedAt !== undefined) startClock(props.startedAt);
  else startIdle();
});
onBeforeUnmount(() => {
  generation++;
  stopAll();
});
</script>

<template>
  <div class="rings">
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <g v-for="(ring, i) in rings" :key="ring.r">
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
        <!-- track: colour fades between idle and running -->
        <circle
          class="track"
          cx="200"
          cy="200"
          :r="ring.r"
          fill="none"
          :style="{ stroke: running ? 'var(--dot-light)' : ring.idleColor }"
          :stroke-width="ring.size"
          stroke-linecap="round"
          :stroke-dasharray="`0 ${ring.gap}`"
        />
        <!-- filled dots, revealed by the arc mask -->
        <circle
          cx="200"
          cy="200"
          :r="ring.r"
          fill="none"
          stroke="var(--ink)"
          :stroke-width="ring.size"
          stroke-linecap="round"
          :stroke-dasharray="`0 ${ring.gap}`"
          :mask="`url(#${ring.maskId})`"
        />
        <g :ref="(el) => (markerEls[i] = el as SVGGElement | null)" class="marker">
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
    </svg>
    <div class="center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.rings {
  position: relative;
  width: min(85vw, 420px, 46dvh); /* 46dvh: fits with title + tab bar on short phones */
  aspect-ratio: 1;
}
svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.marker {
  transform-origin: 200px 200px;
}
.track {
  transition: stroke 0.7s ease;
}
/* Arc mask: starts at 12 o'clock; dashoffset 100 = empty, 0 = full (animated from script). */
.fill-arc {
  transform-origin: 200px 200px;
  transform: rotate(-90deg);
  stroke-dasharray: 100 100;
  stroke-dashoffset: 100;
}
.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
</style>
