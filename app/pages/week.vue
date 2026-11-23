<script setup lang="ts">
const { windows, tags } = useTimeWindows();
const now = useNow();

const HOUR = 3_600_000;
const MIN_SPAN_H = 8; // the clock range shows at least 8 h

const { weekStart, weekEnd, label } = useSelectedWeek();
useHead({ title: () => `${label.value} · Timely` });
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

// Past days and today open in Track, where their windows can be edited or added.
const NuxtLink = resolveComponent("NuxtLink");
const dayLink = (d: { day: number; isToday: boolean }) =>
  d.isToday ? "/" : { path: "/", query: { day: dayParam(d.day) } };

// ---------- clock timeline ----------
const tagById = computed(() => new Map(tags.value.map((t) => [t.id, t])));

/** Each window's pieces per day, as hour offsets from that day's midnight, colored by first tag. */
const segments = computed(() => {
  const byDay = new Map<number, { from: number; to: number; color: string; title: string }[]>();
  for (const w of windows.value) {
    const start = Math.max(w.start, weekStart.value);
    const end = Math.min(w.end ?? now.value, weekEnd.value);
    if (end <= start) continue;
    const tag = w.tags?.[0] ? tagById.value.get(w.tags[0]) : undefined;
    const title = `${clock(w.start)} – ${w.end ? clock(w.end) : "now"}${tag ? ` · ${tag.name}` : ""}`;
    for (const chunk of splitByDay(start, end)) {
      const s = Math.max(start, chunk.day);
      const list = byDay.get(chunk.day) ?? [];
      list.push({
        from: (s - chunk.day) / HOUR,
        to: (s + chunk.ms - chunk.day) / HOUR,
        color: tag?.color ?? "var(--accent)",
        title,
      });
      byDay.set(chunk.day, list);
    }
  }
  return byDay;
});

/** Shared hour range for every row: fits the week's windows, ≥ 8 h, within 0–24. */
const hourRange = computed(() => {
  let h0 = Infinity;
  let h1 = -Infinity;
  for (const list of segments.value.values())
    for (const s of list) {
      h0 = Math.min(h0, Math.floor(s.from));
      h1 = Math.max(h1, Math.ceil(s.to));
    }
  if (h0 === Infinity) return [8, 18] as const;
  const missing = MIN_SPAN_H - (h1 - h0);
  if (missing > 0) {
    h0 = Math.max(0, h0 - Math.floor(missing / 2));
    h1 = Math.min(24, h0 + MIN_SPAN_H);
    h0 = Math.max(0, h1 - MIN_SPAN_H);
  }
  return [h0, h1] as const;
});
const pct = (h: number) => {
  const [h0, h1] = hourRange.value;
  return ((h - h0) / (h1 - h0)) * 100;
};
const axis = computed(() => {
  const [h0, h1] = hourRange.value;
  const step = h1 - h0 > 12 ? 3 : 2;
  const out: number[] = [];
  for (let h = Math.ceil(h0 / step) * step; h <= h1; h += step) out.push(h);
  return out;
});
const nowHour = computed(() => (now.value - today.value) / HOUR);

const legend = computed(() => {
  const used = new Map<string, { name: string; color: string }>();
  let untagged = false;
  for (const w of windows.value) {
    if ((w.end ?? now.value) <= weekStart.value || w.start >= weekEnd.value) continue;
    const tag = w.tags?.[0] ? tagById.value.get(w.tags[0]) : undefined;
    if (tag) used.set(tag.id, { name: tag.name, color: tag.color });
    else untagged = true;
  }
  if (!used.size) return [];
  const items = [...used.values()];
  if (untagged) items.push({ name: "Untagged", color: "var(--accent)" });
  return items;
});
</script>

<template>
  <main class="page">
    <h1 class="page-title">{{ label }}</h1>
    <WeekStepper />

    <section class="summary">
      <p class="total">{{ hoursMinutes(total) }}</p>
      <p class="caption">hours tracked</p>
    </section>

    <div class="axis" aria-hidden="true">
      <span class="axis-track">
        <span v-for="h in axis" :key="h" class="hour" :style="{ left: `${pct(h)}%` }">
          {{ String(h).padStart(2, "0") }}
        </span>
      </span>
    </div>

    <ol class="days">
      <li v-for="d in days" :key="d.day" :class="{ today: d.isToday, future: d.isFuture }">
        <component
          :is="d.isFuture ? 'div' : NuxtLink"
          class="row"
          :to="d.isFuture ? undefined : dayLink(d)"
          :aria-label="`${d.weekday} ${d.date}: ${hoursMinutes(d.ms)}${d.isFuture ? '' : ', edit'}`"
        >
          <span class="day">
            <span class="weekday">{{ d.weekday }}</span>
            <span class="date">{{ d.date }}</span>
          </span>
          <span class="bar" aria-hidden="true">
            <span
              v-for="(s, i) in segments.get(d.day) ?? []"
              :key="i"
              class="seg"
              :title="s.title"
              :style="{
                left: `${pct(s.from)}%`,
                width: `${pct(s.to) - pct(s.from)}%`,
                background: s.color,
              }"
            />
            <span
              v-if="d.isToday && nowHour >= hourRange[0] && nowHour <= hourRange[1]"
              class="now"
              :style="{ left: `${pct(nowHour)}%` }"
            />
          </span>
          <span class="amount">{{ hoursMinutes(d.ms) }}</span>
        </component>
      </li>
    </ol>

    <ul v-if="legend.length" class="legend">
      <li v-for="l in legend" :key="l.name">
        <span class="dot" :style="{ background: l.color }" />{{ l.name }}
      </li>
    </ul>
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
.row,
.axis {
  display: grid;
  grid-template-columns: 3.25rem 1fr 3.5rem;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0;
}
.days > li {
  border-bottom: 1px dotted var(--dot-light);
}
a.row {
  color: inherit;
  text-decoration: none;
  margin: 0 -0.5rem;
  padding-inline: 0.5rem;
  border-radius: 8px;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease;
}
a.row:hover {
  background: rgb(0 0 0 / 0.03);
}
a.row:active {
  background: rgb(0 0 0 / 0.06);
}
a.row:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
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
/* dotted track (echoes the rings) = untracked time */
.bar {
  position: relative;
  height: 10px;
  background-image: radial-gradient(circle, var(--dot-light) 1.6px, transparent 1.8px);
  background-size: 9px 10px;
  background-position: left center;
}
/* one segment per window, placed at its clock time */
.seg {
  position: absolute;
  top: -1px;
  bottom: -1px;
  min-width: 2px;
  border-radius: 999px;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent),
    0 0 0 1px var(--bg); /* hairline gap between touching windows */
}
.now {
  position: absolute;
  top: -5px;
  bottom: -5px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--ink);
}
.axis {
  width: min(100%, 520px);
  margin: clamp(1.5rem, 5vh, 3rem) auto 0;
  padding: 0;
  border-bottom: none;
}
.axis + .days {
  margin-top: 0;
}
.axis-track {
  grid-column: 2;
  position: relative;
  height: 1rem;
}
.hour {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.7rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.legend {
  list-style: none;
  margin: 1.25rem auto 0;
  padding: 0;
  width: min(100%, 520px);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem 1rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
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
li.future {
  opacity: 0.45;
}
</style>
