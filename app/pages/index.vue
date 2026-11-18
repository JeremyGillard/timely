<script setup lang="ts">
import type { TimeWindow } from "~/composables/useTimeWindows";

useHead({ title: "Timely" });

const HOLD_MS = 3000;

const {
  windows,
  tags,
  active,
  next,
  stop,
  remove,
  setNote,
  restore,
  add,
  setTimes,
  createTag,
  toggleTag,
  tagsByRecency,
} = useTimeWindows();
const now = useNow();

// Swipe-to-remove: at most one row open; tapping anywhere outside it closes it.
const openId = ref<string | null>(null);
const closeOnOutside = (e: PointerEvent) => {
  if (openId.value && !(e.target as Element).closest(".swipe.open")) openId.value = null;
};
function removeWindow(id: string) {
  const w = windows.value.find((x) => x.id === id);
  if (!w) return;
  openId.value = null;
  if (editingId.value === id) editingId.value = null;
  remove(id);
  showUndo(w);
}

// Undo toast: the last deletion can be restored for a few seconds.
const UNDO_MS = 5000;
const lastDeleted = ref<{ window: TimeWindow; at: number } | null>(null);
let undoTimer: ReturnType<typeof setTimeout> | undefined;
function showUndo(w: TimeWindow) {
  lastDeleted.value = { window: w, at: Date.now() };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => (lastDeleted.value = null), UNDO_MS);
}
function undoDelete() {
  if (!lastDeleted.value) return;
  restore(lastDeleted.value.window, lastDeleted.value.at);
  lastDeleted.value = null;
  clearTimeout(undoTimer);
}
const undoMessage = computed(() => {
  const w = lastDeleted.value?.window;
  if (!w) return null;
  return `Deleted ${clock(w.start)} – ${w.end ? clock(w.end) : "now"}`;
});

// Editor sheet: tap a row to edit it, or "+ Add" to create one (a draft until Add).
const editingId = ref<string | null>(null);
const draftNew = ref<TimeWindow | null>(null);
const editing = computed(
  () => draftNew.value ?? windows.value.find((w) => w.id === editingId.value) ?? null,
);
const others = computed(() => windows.value.filter((w) => w.id !== editingId.value));
function startAdding() {
  openId.value = null;
  editingId.value = null;
  draftNew.value = { id: crypto.randomUUID(), ...defaultRange(windows.value, Date.now()) };
}
function closeEditor() {
  editingId.value = null;
  draftNew.value = null;
}
const tagsOf = (w: TimeWindow) =>
  (w.tags ?? []).map((id) => tags.value.find((t) => t.id === id)).filter((t) => t !== undefined);
function onToggleTag(tagId: string) {
  const d = draftNew.value;
  if (d) {
    const has = d.tags?.includes(tagId) ?? false;
    const ids = has ? d.tags!.filter((x) => x !== tagId) : [...(d.tags ?? []), tagId];
    const { tags: _old, ...rest } = d;
    draftNew.value = ids.length ? { ...rest, tags: ids } : rest;
    if (!has) buzz(10);
  } else if (editingId.value && toggleTag(editingId.value, tagId)) buzz(10);
}
function onCreateTag(name: string) {
  const tag = createTag(name);
  const w = editing.value;
  if (tag && w && !w.tags?.includes(tag.id)) onToggleTag(tag.id);
}
function saveEdits(e: { note: string; start: number; end: number | null }) {
  const d = draftNew.value;
  if (d) {
    if (add({ start: e.start, end: e.end ?? Date.now(), note: e.note, tags: d.tags })) buzz(15);
  } else if (editingId.value) {
    setNote(editingId.value, e.note);
    setTimes(editingId.value, e.start, e.end);
  }
  closeEditor();
}

onMounted(() => document.addEventListener("pointerdown", closeOnOutside));
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutside);
  clearTimeout(undoTimer);
});

const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

const press = usePressHold({
  holdMs: HOLD_MS,
  canHold: () => active.value !== null,
  onTap: () => {
    next();
    buzz(15);
  },
  onHold: () => {
    stop();
    buzz([30, 60, 30]);
  },
});

function onKeydown(e: KeyboardEvent) {
  if (e.repeat) return;
  press.start();
}

// ---------- display ----------

const elapsed = computed(() => (active.value ? Math.max(0, now.value - active.value.start) : 0));

const startOfToday = computed(() => startOfDay(now.value));
const today = computed(() =>
  windows.value.filter((w) => w.start >= startOfToday.value).toReversed(),
);
const todayTotal = computed(() =>
  today.value.reduce((sum, w) => sum + ((w.end ?? now.value) - w.start), 0),
);

const hint = computed(() =>
  active.value
    ? `Tap to start a new window · Hold ${HOLD_MS / 1000} s to stop`
    : "Tap to start a window",
);
</script>

<template>
  <main class="page">
    <h1 class="page-title">Timely</h1>

    <section class="timer">
      <DottedRings :started-at="active?.start">
        <div
          class="press"
          :class="{ holding: press.holding.value }"
          :style="{ '--hold': `${HOLD_MS}ms` }"
        >
          <svg class="hold" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="48" pathLength="100" />
          </svg>
          <button
            type="button"
            class="cta"
            :class="{ running: active }"
            :aria-label="active ? `Running ${duration(elapsed)}. ${hint}` : hint"
            @pointerdown="press.start"
            @pointerup="press.end"
            @pointercancel="press.cancel"
            @pointerleave="press.cancel"
            @contextmenu.prevent
            @keydown.enter.space.prevent="onKeydown"
            @keyup.enter.space.prevent="press.end"
          >
            <template v-if="active">
              <span class="elapsed">{{ duration(elapsed) }}</span>
              <span class="sub">Window {{ today.length }}</span>
            </template>
            <span v-else>Start</span>
          </button>
        </div>
      </DottedRings>
      <p class="hint" aria-live="polite">{{ hint }}</p>
    </section>

    <section class="log">
      <div class="log-head">
        <span>Today</span>
        <button type="button" class="add" aria-label="Add a time window" @click="startAdding">
          + Add
        </button>
        <span class="total">{{ duration(todayTotal) }}</span>
      </div>
      <TransitionGroup tag="ol" name="row">
        <li v-for="w in today" :key="w.id" :class="{ live: !w.end }">
          <SwipeRow
            :open="openId === w.id"
            :label="`${clock(w.start)} to ${w.end ? clock(w.end) : 'now'}`"
            @update:open="(v) => (openId = v ? w.id : null)"
            @select="editingId = w.id"
            @remove="removeWindow(w.id)"
          >
            <div class="row">
              <span class="when">
                <span>{{ clock(w.start) }} – {{ w.end ? clock(w.end) : "now" }}</span>
                <span v-if="w.tags?.length || w.note" class="meta">
                  <span v-for="t in tagsOf(w)" :key="t.id" class="tag">
                    <span class="dot" :style="{ background: t.color }" />{{ t.name }}
                  </span>
                  <span v-if="w.note" class="note">{{ w.note }}</span>
                </span>
              </span>
              <span class="amount">{{ duration((w.end ?? now) - w.start) }}</span>
            </div>
          </SwipeRow>
        </li>
      </TransitionGroup>
    </section>

    <WindowEditor
      :window="editing"
      :now="now"
      :tags="tagsByRecency"
      :others="others"
      :is-new="draftNew !== null"
      @toggle-tag="onToggleTag"
      @create-tag="onCreateTag"
      @close="closeEditor"
      @save="saveEdits"
      @delete="editing && removeWindow(editing.id)"
    />

    <UndoToast :message="undoMessage" @action="undoDelete" />
  </main>
</template>

<style scoped>
.timer {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 0;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
}

/* ---------- button + hold progress ---------- */
.press {
  position: relative;
  width: clamp(7.5rem, 32vw, 9.5rem);
  aspect-ratio: 1;
}
.hold {
  position: absolute;
  inset: -12px;
  width: calc(100% + 24px);
  height: calc(100% + 24px);
  transform: rotate(-90deg);
  pointer-events: none;
}
.hold circle {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  opacity: 0;
  transition:
    stroke-dashoffset 0.2s ease,
    opacity 0.2s ease;
}
.holding .hold circle {
  stroke-dashoffset: 0;
  opacity: 1;
  transition:
    stroke-dashoffset var(--hold) linear,
    opacity 0.2s ease;
}

.cta {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 1.1rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.25);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  /* long-press friendly on touch devices */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.cta:hover {
  box-shadow: 0 14px 36px -12px rgb(0 0 0 / 0.3);
}
.cta:active,
.holding .cta {
  transform: scale(0.96);
}
.cta:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}
.elapsed {
  font-size: clamp(1.3rem, 5.5vw, 1.6rem);
  font-weight: 300;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.sub {
  font-size: 0.75rem;
  opacity: 0.6;
}

/* ---------- today log ---------- */
.log {
  width: min(100%, 420px);
  margin: 0 auto;
  font-variant-numeric: tabular-nums;
}
.log-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--dot-light);
}
.log-head .total {
  margin-left: auto;
}
.add {
  all: unset;
  cursor: pointer;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  border: 1px dashed var(--dot-light);
  color: var(--muted);
  font-size: 0.85rem;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.1s ease-out,
    color 0.15s ease,
    border-color 0.15s ease;
}
.add:hover {
  color: var(--ink);
  border-color: var(--muted);
}
.add:active {
  transform: scale(0.96);
}
.add:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .add:active {
    transform: none;
  }
}
ol {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  border-bottom: 1px dotted var(--dot-light);
  color: var(--muted);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.6rem 0;
}
.when {
  display: grid;
  min-width: 0;
}
.meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 0.85rem;
  color: var(--ink);
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  font-weight: 500;
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}
.note {
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
}
.amount {
  flex-shrink: 0;
}
/* removal: slide out left + fade, remaining rows glide up */
.row-move,
.row-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}
.row-leave-active {
  position: absolute;
  width: 100%;
}
.row-leave-to {
  opacity: 0;
  transform: translateX(-30%);
}
li.live {
  color: var(--ink);
}
</style>
