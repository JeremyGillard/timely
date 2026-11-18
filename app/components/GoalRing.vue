<script setup lang="ts">
// Weekly goal gauge: one dotted ring (same language as the Track rings) filling clockwise
// from 12 o'clock, with the lime marker riding the head. Past 100 % the whole ring turns ink.
const props = defineProps<{ progress: number }>();

const R = 170;
const DOTS = 72;
const GAP = (2 * Math.PI * R) / DOTS;
const uid = useId();

// starts empty and fills to the value once mounted, so arriving on the page animates
const mounted = ref(false);
onMounted(() => requestAnimationFrame(() => (mounted.value = true)));
const p = computed(() => (mounted.value ? Math.min(1, Math.max(0, props.progress)) : 0));
const done = computed(() => props.progress >= 1);
</script>

<template>
  <div class="goal-ring">
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <mask :id="`${uid}-m`" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
        <circle
          class="arc"
          cx="200"
          cy="200"
          :r="R"
          fill="none"
          stroke="#fff"
          stroke-width="20"
          pathLength="100"
          :style="{ strokeDashoffset: 100 * (1 - p) }"
        />
      </mask>
      <circle
        cx="200"
        cy="200"
        :r="R"
        fill="none"
        stroke="var(--dot-light)"
        stroke-width="6"
        stroke-linecap="round"
        :stroke-dasharray="`0 ${GAP}`"
      />
      <circle
        cx="200"
        cy="200"
        :r="R"
        fill="none"
        stroke="var(--ink)"
        stroke-width="6"
        stroke-linecap="round"
        :stroke-dasharray="`0 ${GAP}`"
        :mask="`url(#${uid}-m)`"
      />
      <g class="marker" :style="{ transform: `rotate(${p * 360}deg)` }">
        <circle
          cx="200"
          :cy="200 - R"
          r="11"
          :fill="done ? 'var(--ink)' : 'var(--accent)'"
          stroke="var(--ink)"
          stroke-width="2"
        />
      </g>
    </svg>
    <div class="center"><slot /></div>
  </div>
</template>

<style scoped>
.goal-ring {
  position: relative;
  width: min(78vw, 320px);
  aspect-ratio: 1;
}
svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.arc {
  transform-origin: 200px 200px;
  transform: rotate(-90deg);
  stroke-dasharray: 100 100;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.65, 0, 0.35, 1);
}
.marker {
  transform-origin: 200px 200px;
  transition: transform 0.9s cubic-bezier(0.65, 0, 0.35, 1);
}
.center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .arc,
  .marker {
    transition: none;
  }
}
</style>
