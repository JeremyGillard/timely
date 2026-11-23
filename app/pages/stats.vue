<script setup lang="ts">
import type { Period } from "~/utils/stats";
import { TARGET_MAX_H, TARGET_MIN_H } from "~/composables/useSettings";

useHead({ title: "Stats · Timely" });

const { windows, tags, tagsByRecency, setNote, setTimes, createTag, toggleTag } = useTimeWindows();
const { settings, setWeeklyTarget } = useSettings();
const now = useNow();
const HOUR = 3_600_000;

// ---------- weekly goal ----------
const { weekStart, weekEnd, isCurrent, label, range: weekRange } = useSelectedWeek();
/** Where Week/Month/trend are anchored: now for the current week, else the selected Monday. */
const anchor = computed(() => (isCurrent.value ? now.value : weekStart.value));
const weekDone = computed(() => {
  let ms = 0;
  for (const v of tagTotals(windows.value, weekStart.value, weekEnd.value, now.value).values())
    ms += v;
  return ms;
});
const weekName = computed(() =>
  label.value.startsWith("Week") ? `in ${label.value.toLowerCase()}` : label.value.toLowerCase(),
);
const targetMs = computed(() => settings.value.weeklyTargetH * HOUR);
const progress = computed(() => weekDone.value / targetMs.value);
const remaining = computed(() => targetMs.value - weekDone.value);

const editingTarget = ref(false);
const targetInput = ref<HTMLInputElement | null>(null);
async function editTarget() {
  editingTarget.value = true;
  await nextTick();
  targetInput.value?.select();
}
function commitTarget(e: Event) {
  setWeeklyTarget(Number((e.target as HTMLInputElement).value));
  editingTarget.value = false;
}
const step = (d: number) => setWeeklyTarget(settings.value.weeklyTargetH + d);

// ---------- time by tag ----------
const period = ref<Period>("week");
const periods: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];
const range = computed(() =>
  period.value === "all"
    ? periodRange("all", now.value, windows.value)
    : periodRange(period.value, anchor.value, windows.value),
);
const tagById = computed(() => new Map(tags.value.map((t) => [t.id, t])));
const trend = computed(() => weeklyTagTrend(windows.value, now.value, 8, anchor.value));

const rows = computed(() => {
  const totals = tagTotals(windows.value, range.value.from, range.value.to, now.value);
  let sum = 0;
  for (const v of totals.values()) sum += v;
  const list = [...totals]
    .map(([id, ms]) => {
      const tag = id ? tagById.value.get(id) : undefined;
      const weeks = trend.value.byTag.get(id) ?? [];
      return {
        id,
        name: id ? (tag?.name ?? "Deleted tag") : "Untagged",
        color: tag?.color ?? "var(--accent)",
        ms,
        share: sum ? ms / sum : 0,
        weeks,
        weeksMax: Math.max(1, ...weeks),
      };
    })
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.ms - a.ms)); // untagged last
  return { list, sum, max: Math.max(1, ...list.map((r) => r.ms)) };
});
const pct = (x: number) => `${Math.round(x * 100)}%`;

// ---------- export ----------
const exportList = computed(() =>
  exportRows(windows.value, tags.value, range.value.from, range.value.to),
);
const periodName = computed(() =>
  period.value === "week"
    ? weekRange.value
    : period.value === "month"
      ? new Date(range.value.from).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : "all time",
);
const runningExcluded = computed(() =>
  windows.value.some(
    (w) => w.end === null && w.start >= range.value.from && w.start < range.value.to,
  ),
);
function exportAs(kind: "csv" | "ics") {
  const { from, to } = range.value; // "all": earliest window → today
  void (kind === "csv"
    ? saveFile(exportFilename(from, to, "csv"), toCsv(exportList.value), "text/csv")
    : saveFile(
        exportFilename(from, to, "ics"),
        toIcs(exportList.value, Date.now()),
        "text/calendar",
      ));
}

// ---------- untagged windows ----------
const showUntagged = ref(false);
const untagged = computed(() =>
  windows.value
    .filter(
      (w) => !w.tags?.length && (w.end ?? now.value) > range.value.from && w.start < range.value.to,
    )
    .toReversed(),
);
const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// editor sheet (same one as on Track)
const editingId = ref<string | null>(null);
const editing = computed(() => windows.value.find((w) => w.id === editingId.value) ?? null);
const others = computed(() => windows.value.filter((w) => w.id !== editingId.value));
function onToggleTag(tagId: string) {
  if (editingId.value && toggleTag(editingId.value, tagId)) navigator.vibrate?.(10);
}
function onCreateTag(name: string) {
  const tag = createTag(name);
  if (tag && editing.value && !editing.value.tags?.includes(tag.id)) onToggleTag(tag.id);
}
function saveEdits(e: { note: string; start: number; end: number | null }) {
  if (editingId.value) {
    setNote(editingId.value, e.note);
    setTimes(editingId.value, e.start, e.end);
  }
  editingId.value = null;
}
</script>

<template>
  <main class="page">
    <h1 class="page-title">Stats</h1>

    <WeekStepper />

    <!-- weekly goal -->
    <section class="goal" aria-labelledby="goal-title">
      <h2 id="goal-title" class="sr-only">Weekly goal</h2>
      <GoalRing :progress="progress">
        <div class="goal-center">
          <span class="goal-done">{{ hoursMinutes(weekDone) }}</span>
          <span class="goal-of">of {{ settings.weeklyTargetH }} h {{ weekName }}</span>
          <span class="goal-left" :class="{ reached: remaining <= 0 }">
            {{
              remaining > 0
                ? `${hoursMinutes(remaining)} ${isCurrent ? "to go" : "short"}`
                : `Goal reached${remaining < 0 ? ` · +${hoursMinutes(-remaining)}` : ""}`
            }}
          </span>
        </div>
      </GoalRing>

      <div class="target" role="group" aria-label="Weekly target">
        <span class="target-label">Weekly target</span>
        <button
          type="button"
          class="step"
          aria-label="Decrease target by 1 hour"
          :disabled="settings.weeklyTargetH <= TARGET_MIN_H"
          @click="step(-1)"
        >
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
        </button>
        <input
          v-if="editingTarget"
          ref="targetInput"
          class="target-input"
          type="number"
          inputmode="numeric"
          :min="TARGET_MIN_H"
          :max="TARGET_MAX_H"
          :value="settings.weeklyTargetH"
          aria-label="Weekly target in hours"
          @keydown.enter.prevent="commitTarget"
          @keydown.esc.prevent="editingTarget = false"
          @blur="commitTarget"
        />
        <button
          v-else
          type="button"
          class="target-value"
          aria-label="Edit weekly target"
          @click="editTarget"
        >
          {{ settings.weeklyTargetH }} h
        </button>
        <button
          type="button"
          class="step"
          aria-label="Increase target by 1 hour"
          :disabled="settings.weeklyTargetH >= TARGET_MAX_H"
          @click="step(1)"
        >
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8h9M8 3.5v9" />
          </svg>
        </button>
      </div>
    </section>

    <!-- time by tag -->
    <section class="tags" aria-labelledby="tags-title">
      <div class="section-head">
        <h2 id="tags-title">Time by tag</h2>
        <div class="segmented" role="tablist" aria-label="Period">
          <button
            v-for="p in periods"
            :key="p.id"
            type="button"
            role="tab"
            :aria-selected="period === p.id"
            @click="period = p.id"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <p v-if="!rows.list.length" class="empty">Nothing tracked in this period.</p>
      <template v-else>
        <div class="cols" aria-hidden="true">
          <span />
          <span />
          <span class="trend-head">8 weeks</span>
        </div>
        <ul class="tag-list">
          <li v-for="r in rows.list" :key="r.id ?? 'none'" :class="{ untagged: r.id === null }">
            <span class="name">
              <span class="dot" :style="{ background: r.color }" /><span class="label">{{
                r.name
              }}</span>
            </span>
            <span class="bar" aria-hidden="true">
              <span
                class="fill"
                :style="{ width: `${(r.ms / rows.max) * 100}%`, background: r.color }"
              />
            </span>
            <span class="nums">
              <span class="amount">{{ hoursMinutes(r.ms) }}</span>
              <span class="share">{{ pct(r.share) }}</span>
            </span>
            <span
              class="trend"
              role="img"
              :aria-label="`Last 8 weeks: ${r.weeks.map(hoursMinutes).join(', ')}`"
            >
              <span
                v-for="(w, i) in r.weeks"
                :key="i"
                class="col"
                :class="{ current: i === r.weeks.length - 1 }"
                :style="{ height: `${Math.max(2, (w / r.weeksMax) * 100)}%`, background: r.color }"
              />
            </span>
            <button
              v-if="r.id === null"
              type="button"
              class="untagged-toggle"
              :aria-expanded="showUntagged"
              @click="showUntagged = !showUntagged"
            >
              {{
                showUntagged
                  ? "Hide"
                  : `Tag ${untagged.length} window${untagged.length === 1 ? "" : "s"}`
              }}
            </button>
          </li>
        </ul>

        <ul v-if="showUntagged && untagged.length" class="untagged-list">
          <li v-for="w in untagged" :key="w.id">
            <button type="button" @click="editingId = w.id">
              <span class="u-day">{{ day(w.start) }}</span>
              <span class="u-time">{{ clock(w.start) }} – {{ w.end ? clock(w.end) : "now" }}</span>
              <span class="u-dur">{{ hoursMinutes((w.end ?? now) - w.start) }}</span>
              <span class="u-go" aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
      </template>

      <div class="export" role="group" aria-label="Export">
        <div class="export-actions">
          <button type="button" :disabled="!exportList.length" @click="exportAs('csv')">
            Export CSV
          </button>
          <button type="button" :disabled="!exportList.length" @click="exportAs('ics')">
            Add to calendar
          </button>
        </div>
        <p class="export-caption">
          {{ exportList.length }} window{{ exportList.length === 1 ? "" : "s" }} · {{ periodName
          }}<template v-if="runningExcluded"> · running window not included</template>
        </p>
      </div>
    </section>

    <WindowEditor
      :window="editing"
      :now="now"
      :tags="tagsByRecency"
      :others="others"
      :deletable="false"
      @toggle-tag="onToggleTag"
      @create-tag="onCreateTag"
      @close="editingId = null"
      @save="saveEdits"
    />
  </main>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
section {
  width: min(100%, 520px);
  margin: clamp(1.5rem, 5vh, 3rem) auto 0;
}

/* ---------- goal ---------- */
.goal {
  display: grid;
  justify-items: center;
  gap: 1.25rem;
}
.goal-center {
  display: grid;
  gap: 0.2rem;
}
.goal-done {
  font-size: clamp(2.6rem, 12vw, 3.6rem);
  font-weight: 200;
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.goal-of {
  color: var(--muted);
  font-size: 0.85rem;
}
.goal-left {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.goal-left.reached {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
}
.target {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-variant-numeric: tabular-nums;
}
.target-label {
  color: var(--muted);
  font-size: 0.9rem;
  margin-right: 0.5rem;
}
.step,
.target-value {
  all: unset;
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
  font-size: 1.1rem;
}
.icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
}
.step:disabled {
  opacity: 0.35;
  cursor: default;
}
.target-value {
  box-sizing: border-box; /* `all: unset` resets it to content-box */
  min-width: 3.25rem; /* room for "100 h" without the steppers jumping */
  padding: 0.35rem 0.35rem;
  border-radius: 10px;
  font-weight: 500;
  font-size: 1.05rem;
  text-align: center;
}
.target-value:hover {
  background: rgb(0 0 0 / 0.04);
}
.step:not(:disabled):active,
.target-value:active {
  transform: scale(0.94);
}
.step:focus-visible,
.target-value:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.target-input {
  box-sizing: border-box;
  width: 3.25rem;
  padding: 0.35rem 0.4rem;
  border: 1px solid var(--dot-light);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 1rem; /* ≥16px: no iOS zoom */
  font-weight: 500;
  text-align: center;
}

/* ---------- tags ---------- */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--dot-light);
}
h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}
.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.05);
}
.segmented button {
  all: unset;
  cursor: pointer;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--muted);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.segmented button[aria-selected="true"] {
  background: #fff;
  color: var(--ink);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
}
.segmented button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.empty {
  color: var(--muted);
  text-align: center;
  padding: 1.5rem 0;
  margin: 0;
}
.cols,
.tag-list > li {
  display: grid;
  grid-template-columns: minmax(5.5rem, 8rem) 1fr 4.25rem 4rem;
  align-items: center;
  gap: 0.75rem;
}
.cols {
  padding-top: 0.5rem;
}
.trend-head {
  grid-column: 4;
  font-size: 0.65rem;
  color: var(--muted);
  text-align: center;
}
.tag-list,
.untagged-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-variant-numeric: tabular-nums;
}
.tag-list > li {
  padding: 0.6rem 0;
  border-bottom: 1px dotted var(--dot-light);
}
.name {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  font-weight: 500;
}
.label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dot {
  flex-shrink: 0;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
}
.bar {
  position: relative;
  height: 10px;
  background-image: radial-gradient(circle, var(--dot-light) 1.6px, transparent 1.8px);
  background-size: 9px 10px;
  background-position: left center;
}
.fill {
  position: absolute;
  inset: -1px auto -1px 0;
  min-width: 4px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
  transition: width 0.4s ease;
}
.nums {
  display: grid;
  justify-items: end;
  line-height: 1.2;
}
.amount {
  font-size: 0.95rem;
}
.share {
  font-size: 0.75rem;
  color: var(--muted);
}
.trend {
  height: 1.6rem;
  display: flex;
  align-items: flex-end;
  gap: 2px;
}
.col {
  flex: 1;
  border-radius: 2px;
  opacity: 0.45;
}
.col.current {
  opacity: 1;
}
li.untagged .name {
  color: var(--muted);
}
.untagged-toggle {
  all: unset;
  grid-column: 1 / -1;
  justify-self: start;
  cursor: pointer;
  margin-top: 0.35rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  border: 1px dashed var(--dot-light);
  font-size: 0.8rem;
  color: var(--ink);
}
.untagged-toggle:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.untagged-list {
  margin-top: 0.25rem;
}
.untagged-list button {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  cursor: pointer;
  display: grid;
  grid-template-columns: 6.5rem 1fr auto 1rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.25rem;
  border-bottom: 1px dotted var(--dot-light);
  font-size: 0.9rem;
}
.untagged-list button:hover {
  background: rgb(0 0 0 / 0.03);
}
.untagged-list button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}
.u-day,
.u-dur,
.u-go {
  color: var(--muted);
}

/* ---------- export ---------- */
.export {
  margin-top: 1.5rem;
  display: grid;
  justify-items: center;
  gap: 0.5rem;
}
.export-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}
.export-actions button {
  all: unset;
  cursor: pointer;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--dot-light);
  background: #fff;
  font-size: 0.85rem;
  font-weight: 500;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s ease-out;
}
.export-actions button:not(:disabled):active {
  transform: scale(0.96);
}
.export-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}
.export-actions button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.export-caption {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}

@media (max-width: 420px) {
  .cols,
  .tag-list > li {
    grid-template-columns: minmax(4.5rem, 6rem) 1fr 3.75rem 3rem;
    gap: 0.5rem;
  }
}
</style>
