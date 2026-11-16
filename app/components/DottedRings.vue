<script setup lang="ts">
// Three concentric dotted rings (dots = zero-length dashes with round caps).
//
// Idle (no `startedAt`): slow decorative spin (outer ring black, inner rings grey).
// Running (`startedAt` = window start, epoch ms): each ring is a gauge filling clockwise from 12 o'clock,
//   outer = seconds (fills every minute), middle = minutes (every hour), inner = hours (every 12 h).
//   Filled dots are black, the rest grey; a marker rides the head of the fill.
//   Pure CSS animations, phase-shifted by a negative delay to match time already elapsed.
const props = defineProps<{ startedAt?: number }>();

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

const running = props.startedAt !== undefined;
// Captured once at mount (component is re-keyed per window), not re-computed every tick.
const offset = running ? Math.max(0, Date.now() - props.startedAt!) : 0;

const clockStyle = (period: number) => ({
  animationDuration: `${period}ms`,
  animationDelay: `-${offset}ms`,
});
</script>

<template>
  <div class="rings">
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <template v-for="ring in rings" :key="ring.r">
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
              class="fill-arc"
              cx="200"
              cy="200"
              :r="ring.r"
              fill="none"
              stroke="#fff"
              stroke-width="16"
              pathLength="100"
              :style="clockStyle(ring.period)"
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
          <g class="clock" :style="clockStyle(ring.period)">
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

/* Marker riding the head of the fill: one turn per period (duration + delay set inline). */
.clock {
  animation: spin linear infinite;
}
/* Arc mask: starts at 12 o'clock, grows clockwise from empty to full over one period. */
.fill-arc {
  transform-origin: 200px 200px;
  transform: rotate(-90deg);
  stroke-dasharray: 100 100;
  animation: fill linear infinite;
}
@keyframes fill {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
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
