<script setup lang="ts">
useHead({ title: "This week · Timely" });

const { windows } = useTimeWindows();
const now = useNow();

const SCALE_MIN_MS = 8 * 3_600_000; // bars scale to at least an 8 h day

const weekStart = computed(() => startOfWeek(now.value));
const weekEnd = computed(() => addDays(weekStart.value, 7));
const today = computed(() => startOfDay(now.value));

/** Time per day (Mon → Sun), windows crossing midnight split across days, running window live. */
const days = computed(() => {
  const totals = new Map<number, number>();
  for (let i = 0; i < 7; i++) totals.set(addDays(weekStart.value, i), 0);

  for (const w of windows.value) {
    const start = Math.max(w.start, weekStart.value);
    const end = Math.min(w.end ?? now.value, weekEnd.value);
    if (end <= start) continue;
    for (const chunk of splitByDay(start, end)) {
      totals.set(chunk.day, (totals.get(chunk.day) ?? 0) + chunk.ms);
    }
  }

  return [...totals].map(([day, ms]) => ({
    day,
    ms,
    weekday: new Date(day).toLocaleDateString("en-GB", { weekday: "short" }),
    date: new Date(day).getDate(),
    isToday: day === today.value,
    isFuture: day > today.value,
  }));
});

const total = computed(() => days.value.reduce((sum, d) => sum + d.ms, 0));
const scale = computed(() => Math.max(SCALE_MIN_MS, ...days.value.map((d) => d.ms)));

const range = computed(() =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).formatRange(
    new Date(weekStart.value),
    new Date(weekEnd.value - 1),
  ),
);
</script>

<template>
  <main class="page">
    <h1 class="page-title">This week</h1>

    <section class="summary">
      <p class="total">{{ hoursMinutes(total) }}</p>
      <p class="caption">hours tracked · {{ range }}</p>
    </section>

    <ol class="days">
      <li
        v-for="d in days"
        :key="d.day"
        :class="{ today: d.isToday, future: d.isFuture }"
        :aria-label="`${d.weekday} ${d.date}: ${hoursMinutes(d.ms)}`"
      >
        <span class="day">
          <span class="weekday">{{ d.weekday }}</span>
          <span class="date">{{ d.date }}</span>
        </span>
        <span class="bar" aria-hidden="true">
          <span class="fill" :style="{ width: `${(d.ms / scale) * 100}%` }" />
        </span>
        <span class="amount">{{ hoursMinutes(d.ms) }}</span>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.summary {
  margin: clamp(1.5rem, 5vh, 3rem) auto 0;
  text-align: center;
}
.total {
  margin: 0;
  font-size: clamp(4rem, 20vw, 6.5rem);
  font-weight: 200;
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.caption {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.days {
  list-style: none;
  margin: clamp(1.5rem, 5vh, 3rem) auto 0;
  padding: 0;
  width: min(100%, 520px);
  display: grid;
  gap: 0.25rem;
  font-variant-numeric: tabular-nums;
}
li {
  display: grid;
  grid-template-columns: 3.25rem 1fr 3.5rem;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px dotted var(--dot-light);
}
.day {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.weekday {
  font-weight: 500;
}
.date {
  color: var(--muted);
  font-size: 0.8rem;
}
/* dotted track (echoes the rings) with a lime fill */
.bar {
  position: relative;
  height: 10px;
  background-image: radial-gradient(circle, var(--dot-light) 1.6px, transparent 1.8px);
  background-size: 9px 10px;
  background-position: left center;
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  max-width: 100%;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
  transition: width 0.4s ease;
}
.amount {
  text-align: right;
  color: var(--muted);
}
li.today .weekday,
li.today .amount {
  color: var(--ink);
  font-weight: 600;
}
li.today .fill {
  background: var(--ink);
  box-shadow: none;
}
li.future {
  opacity: 0.45;
}
</style>
