<script setup lang="ts">
// ‹ 16 – 22 Nov › — browse weeks; tapping the range jumps back to this week.
const { range, isCurrent, prev, next, reset } = useSelectedWeek();
</script>

<template>
  <div class="stepper" role="group" aria-label="Week">
    <button type="button" class="step" aria-label="Previous week" @click="prev">
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
    </button>
    <button
      type="button"
      class="range"
      :disabled="isCurrent"
      :title="isCurrent ? undefined : 'Back to this week'"
      :aria-label="isCurrent ? range : `${range}, back to this week`"
      @click="reset"
    >
      {{ range }}
    </button>
    <button type="button" class="step" aria-label="Next week" :disabled="isCurrent" @click="next">
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-variant-numeric: tabular-nums;
}
.step,
.range {
  all: unset;
  box-sizing: border-box;
  cursor: pointer;
  display: grid;
  place-items: center;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.1s ease-out,
    background-color 0.15s ease;
}
.step {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 50%;
  border: 1px solid var(--dot-light);
  background: #fff;
}
.icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.range {
  min-width: 8.5rem;
  padding: 0.35rem 0.6rem;
  border-radius: 10px;
  font-weight: 500;
  text-align: center;
}
.range:not(:disabled):hover {
  background: rgb(0 0 0 / 0.04);
}
.range:disabled {
  cursor: default;
}
.step:disabled {
  opacity: 0.35;
  cursor: default;
}
.step:not(:disabled):active,
.range:not(:disabled):active {
  transform: scale(0.94);
}
.step:focus-visible,
.range:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
</style>
