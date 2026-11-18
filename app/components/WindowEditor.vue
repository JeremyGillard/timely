<script setup lang="ts">
// Edit a time window: start/end (minute ruler), tags, label/note. Native <dialog>: Esc / backdrop click close it.
// Phones: bottom sheet. Larger screens: centred card.
import {
  MIN_WINDOW_MS,
  neighboursAt,
  planRange,
  type Tag,
  type TimeWindow,
} from "~/composables/useTimeWindows";

// `tags` comes ordered most-recently-used first.
const props = defineProps<{
  window: TimeWindow | null;
  now: number;
  tags: Tag[];
  /** All other windows; the ones right before / after get trimmed on Save if overlapped. */
  others: TimeWindow[];
  /** Creating a new window (not yet saved) rather than editing one. */
  isNew?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  save: [edits: { note: string; start: number; end: number | null }];
  delete: [];
  "toggle-tag": [id: string];
  "create-tag": [name: string];
}>();

// Chip order is frozen while the sheet is open, so chips never shuffle under the finger.
const order = ref<string[]>([]);
const chips = computed(() => {
  const byId = new Map(props.tags.map((t) => [t.id, t]));
  const known = order.value.map((id) => byId.get(id)).filter((t): t is Tag => !!t);
  const added = props.tags.filter((t) => !order.value.includes(t.id));
  return [...known, ...added];
});
const selected = computed(() => new Set(props.window?.tags ?? []));

const adding = ref(false);
const newTag = ref("");
const newTagInput = ref<HTMLInputElement | null>(null);
async function startAdding() {
  adding.value = true;
  newTag.value = "";
  await nextTick();
  newTagInput.value?.focus();
}
const addButton = ref<HTMLButtonElement | null>(null);
async function commitNewTag(e?: Event) {
  if (!adding.value) return; // blur fires after Enter/Esc unmounts the input
  adding.value = false;
  if (newTag.value.trim()) emit("create-tag", newTag.value);
  if (e?.type === "keydown") {
    await nextTick();
    addButton.value?.focus(); // keep keyboard flow: Enter again to add another
  }
}
async function cancelNewTag() {
  adding.value = false;
  await nextTick();
  addButton.value?.focus();
}

// ---------- start / end (draft until Save) ----------
const draftStart = ref(0);
const draftEnd = ref<number | null>(null);
const edge = ref<"start" | "end" | null>(null);
const running = computed(() => draftEnd.value === null);
const endOrNow = computed(() => draftEnd.value ?? props.now);

// Neighbours follow the draft start, so a new window can be placed anywhere.
const neighbours = computed(() => neighboursAt(props.others, draftStart.value));
const prev = computed(() => neighbours.value.prev);
const next = computed(() => neighbours.value.next);

// Hard limits.
// Editing: may overlap a neighbour, but not swallow it (it keeps ≥ MIN_WINDOW_MS).
// Creating: free placement over the last 24 h; Start moves the whole window (End sets its
// length), and conflicts (swallowing / sitting inside a window) block Add instead.
const length = computed(() => endOrNow.value - draftStart.value);
const startMin = computed(() =>
  props.isNew
    ? props.now - DAY_MS
    : prev.value
      ? prev.value.start + MIN_WINDOW_MS
      : (props.window?.start ?? 0) - DAY_MS,
);
const startMax = computed(() =>
  props.isNew ? props.now - length.value : endOrNow.value - MIN_WINDOW_MS,
);
const endMin = computed(() => draftStart.value + MIN_WINDOW_MS);
const endMax = computed(() =>
  props.isNew
    ? props.now
    : Math.min(props.now, next.value ? (next.value.end ?? props.now) - MIN_WINDOW_MS : Infinity),
);
/** v-model for the Start ruler: creating moves the whole window, editing moves the start. */
const startModel = computed({
  get: () => draftStart.value,
  set: (v: number) => {
    if (props.isNew && draftEnd.value !== null) draftEnd.value = v + length.value;
    draftStart.value = v;
  },
});
/** Other windows, drawn as blocks on the ruler. */
const busy = computed(() =>
  props.others.map((w) => ({
    start: w.start,
    end: w.end ?? props.now,
    label: w.note ?? `${clock(w.start)} – ${w.end ? clock(w.end) : "now"}`,
  })),
);
// Magnetic points: values where the edited edge(s) meet another window exactly.
const startSnaps = computed(() =>
  props.others.flatMap((w) => {
    const end = w.end ?? props.now;
    // creating (whole window moves): start meets an end, or the end meets a start
    return props.isNew ? [end, w.start - length.value] : [end];
  }),
);
const endSnaps = computed(() => props.others.map((w) => w.start));
// Creating: a window dropped between two others, with each edge within FILL_RANGE of its
// neighbour (short of it or overlapping it), stretches/shrinks to fill the gap exactly.
const FILL_RANGE = 5 * 60_000;
let stopFill: (() => void) | null = null;
function onStartDrop() {
  if (!props.isNew || draftEnd.value === null) return;
  const s = draftStart.value;
  const e = draftEnd.value;
  const mid = (s + e) / 2;
  let prevEnd = -Infinity;
  let nextStart = Infinity;
  for (const w of props.others) {
    const end = w.end ?? props.now;
    if (end <= mid) prevEnd = Math.max(prevEnd, end);
    if (w.start >= mid) nextStart = Math.min(nextStart, w.start);
  }
  if (Math.abs(s - prevEnd) > FILL_RANGE || Math.abs(e - nextStart) > FILL_RANGE) return;
  if (nextStart - prevEnd < MIN_WINDOW_MS || (s === prevEnd && e === nextStart)) return;
  navigator.vibrate?.(8);
  // ease both edges onto the gap together (the ruler follows the start)
  const from = { s, e };
  const to = { s: prevEnd, e: nextStart };
  const apply = (t: number) => {
    draftEnd.value = Math.round(from.e + (to.e - from.e) * t);
    draftStart.value = Math.round(from.s + (to.s - from.s) * t);
  };
  stopFill?.();
  if (prefersReducedMotion()) return apply(1);
  stopFill = animateSpring({
    from: 0,
    to: 1,
    response: 0.3,
    onUpdate: (t) => apply(t),
    onDone: () => {
      apply(1);
      stopFill = null;
    },
  });
}
onBeforeUnmount(() => stopFill?.());

/** "Right after / before …" when an edge touches another window exactly. */
const touching = computed(() => {
  const parts: string[] = [];
  const after = props.others.find((w) => (w.end ?? props.now) === draftStart.value);
  const before = props.others.find((w) => w.start === endOrNow.value);
  if (after) parts.push(`right after ${span(after)}`);
  if (before) parts.push(`right before ${span(before)}`);
  const text = parts.join(", ");
  return text ? `Snapped ${text}` : "";
});

/** How the edited window's own block follows the ruler. */
const startBand = computed(() =>
  props.isNew
    ? { kind: "move" as const, other: length.value }
    : { kind: "start" as const, other: endOrNow.value },
);

// What saving would do to the other windows.
const plan = computed(() => planRange(props.others, draftStart.value, endOrNow.value, props.now));
const blocked = computed(() => plan.value.conflicts.length > 0);
const span = (w: { start: number; end: number | null }) =>
  `${clock(w.start)} – ${w.end ? clock(w.end) : "now"}`;
const warning = computed(() => {
  const parts = plan.value.trims.map((t) =>
    t.start !== t.window.start
      ? `Overlaps ${span(t.window)}: it will start at ${clock(t.start)}.`
      : `Overlaps ${span(t.window)}: it will end at ${clock(t.end!)}.`,
  );
  for (const w of plan.value.conflicts) {
    const inside = w.start < draftStart.value && (w.end ?? props.now) > endOrNow.value;
    parts.push(inside ? `Falls inside ${span(w)}.` : `Covers ${span(w)}.`);
  }
  if (blocked.value) parts.push("Move or resize it to save.");
  return parts.join(" ");
});
// one firm bump when an edit starts overlapping
watch(
  () => plan.value.trims.length + plan.value.conflicts.length,
  (n, was) => {
    if (n > was) navigator.vibrate?.(10);
  },
);

const hint = ref("");
let hintTimer: ReturnType<typeof setTimeout> | undefined;
function onLimit(side: "min" | "max") {
  if (edge.value === "start") {
    hint.value =
      side === "max"
        ? "Must start before it ends"
        : prev.value
          ? "Can't go past the start of the previous window"
          : props.isNew
            ? "Up to 24 h back, ending by now"
            : "Up to 24 h back";
  } else {
    hint.value =
      side === "min"
        ? "Must end after it starts"
        : next.value && endMax.value < props.now
          ? "Can't go past the end of the next window"
          : "Can't end in the future";
  }
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (hint.value = ""), 2500);
}
const rulerCaption = computed(
  () =>
    hint.value ||
    touching.value ||
    (props.isNew && edge.value === "start" ? "Moves the whole window" : ""),
);
function pick(which: "start" | "end") {
  edge.value = edge.value === which ? null : which;
  hint.value = "";
}
onBeforeUnmount(() => clearTimeout(hintTimer));

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const draft = ref("");

watch(
  () => props.window?.id,
  (id) => {
    const el = dialog.value;
    if (!el) return;
    if (id) {
      draft.value = props.window?.note ?? "";
      draftStart.value = props.window?.start ?? 0;
      draftEnd.value = props.window?.end ?? null;
      edge.value = props.isNew ? "start" : null;
      hint.value = "";
      order.value = props.tags.map((t) => t.id);
      adding.value = false;
      if (!el.open) el.showModal();
      // new window: times come first (and no on-screen keyboard over the ruler)
      if (!props.isNew) input.value?.focus();
    } else {
      edge.value = null; // next open mounts the ruler only once its draft is set
      if (el.open) el.close();
    }
  },
  { flush: "post" },
);

function save() {
  if (blocked.value) return;
  emit("save", { note: draft.value, start: draftStart.value, end: draftEnd.value });
}

function onKeydown(e: KeyboardEvent) {
  // Enter saves, Shift+Enter = new line
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    save();
  }
}

// Clicking the backdrop (the <dialog> element itself, outside the card) closes.
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) emit("close");
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    aria-labelledby="window-editor-title"
    @cancel.prevent="emit('close')"
    @click="onDialogClick"
  >
    <form v-if="window" class="card" @submit.prevent="save">
      <h2 id="window-editor-title" class="sr-only">
        {{ isNew ? "New time window" : "Edit time window" }}
      </h2>
      <header>
        <div class="range">
          <button
            type="button"
            class="pill"
            :aria-pressed="edge === 'start'"
            aria-label="Adjust start time"
            @click="pick('start')"
          >
            <span class="pill-label">Start</span>{{ clock(draftStart) }}
          </button>
          <span class="arrow" aria-hidden="true">→</span>
          <button
            type="button"
            class="pill"
            :aria-pressed="edge === 'end'"
            :disabled="running"
            :aria-label="running ? 'Still running' : 'Adjust end time'"
            @click="pick('end')"
          >
            <span class="pill-label">End</span>{{ running ? "now" : clock(endOrNow) }}
          </button>
        </div>
        <span class="duration">{{ duration(endOrNow - draftStart) }}</span>
      </header>

      <Transition name="ruler">
        <div v-if="edge" class="ruler" :class="edge">
          <TimeScrubber
            v-if="edge === 'start'"
            key="start"
            v-model="startModel"
            :min="startMin"
            :max="startMax"
            :busy="busy"
            :band="startBand"
            :snap-points="startSnaps"
            :conflict="blocked"
            label="Start"
            @limit="onLimit"
            @drop="onStartDrop"
          />
          <TimeScrubber
            v-else-if="draftEnd !== null"
            key="end"
            v-model="draftEnd"
            :min="endMin"
            :max="endMax"
            :busy="busy"
            :band="{ kind: 'end', other: draftStart }"
            :snap-points="endSnaps"
            :conflict="blocked"
            label="End"
            @limit="onLimit"
          />
          <p class="limit-hint" aria-live="polite">{{ rulerCaption }}</p>
        </div>
      </Transition>

      <p v-if="warning" class="overlap-warning" :class="{ blocked }" role="status">
        <span aria-hidden="true">⚠︎</span> {{ warning }}
      </p>

      <div class="tags" role="group" aria-label="Tags">
        <button
          v-for="t in chips"
          :key="t.id"
          type="button"
          class="chip"
          role="checkbox"
          :aria-checked="selected.has(t.id)"
          :style="{ '--tag': t.color }"
          @click="emit('toggle-tag', t.id)"
        >
          <span class="dot" aria-hidden="true" />{{ t.name }}
        </button>
        <input
          v-if="adding"
          ref="newTagInput"
          v-model="newTag"
          class="chip new-input"
          maxlength="32"
          placeholder="Tag name"
          aria-label="New tag name"
          enterkeyhint="done"
          @keydown.enter.stop.prevent="commitNewTag"
          @keydown.esc.stop.prevent="cancelNewTag"
          @blur="commitNewTag"
        />
        <button v-else ref="addButton" type="button" class="chip add" @click="startAdding">
          + Tag
        </button>
      </div>

      <label class="field">
        <span class="sr-only">Label or note</span>
        <textarea
          ref="input"
          v-model="draft"
          rows="3"
          maxlength="280"
          placeholder="Add a label or note…"
          enterkeyhint="done"
          @keydown="onKeydown"
        />
      </label>

      <div class="actions">
        <button v-if="!isNew" type="button" class="delete" @click="emit('delete')">Delete</button>
        <span class="spacer" />
        <button type="button" class="ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="primary" :disabled="blocked">
          {{ isNew ? "Add" : "Save" }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.sheet {
  border: none;
  padding: 0;
  background: transparent;
  color: var(--ink);
  max-width: none;
  max-height: none;
  overflow: visible;
}
.sheet::backdrop {
  background: rgb(18 18 18 / 0.28);
  backdrop-filter: blur(2px);
}
.card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  background: color-mix(in srgb, #fff 72%, var(--bg));
  box-shadow: 0 24px 60px -24px rgb(0 0 0 / 0.35);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.range {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.pill {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.3rem 0.7rem;
  border-radius: 12px;
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease-out;
}
.pill:not(:disabled):hover {
  background: rgb(0 0 0 / 0.04);
}
.pill:not(:disabled):active {
  transform: scale(0.96);
}
.pill[aria-pressed="true"] {
  background: var(--accent);
  color: var(--accent-ink);
}
.pill:disabled {
  cursor: default;
  color: var(--muted);
}
.pill-label {
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.6;
}
.arrow {
  color: var(--muted);
}
.ruler {
  display: grid;
  gap: 0.35rem;
  transform-origin: 20% 0;
}
.ruler.end {
  transform-origin: 60% 0;
}
.overlap-warning {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning) 14%, #fff);
  color: color-mix(in srgb, var(--warning) 55%, var(--ink));
  font-size: 0.85rem;
  line-height: 1.35;
}
.overlap-warning.blocked {
  background: color-mix(in srgb, var(--danger) 12%, #fff);
  color: color-mix(in srgb, var(--danger) 60%, var(--ink));
}
.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.limit-hint {
  margin: 0;
  min-height: 1.1em;
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
}
.ruler-enter-active,
.ruler-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ruler-enter-from,
.ruler-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(-6px);
}
.duration {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
textarea {
  width: 100%;
  resize: none;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--dot-light);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 1rem; /* ≥16px: no iOS zoom on focus */
  line-height: 1.4;
}
textarea:focus {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--dot-light);
  background: #fff;
  color: var(--ink);
  font-size: 0.9rem;
  font-weight: 450;
  line-height: 1.2;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.1s ease-out,
    background-color 0.15s ease,
    border-color 0.15s ease;
}
.chip:active {
  transform: scale(0.96);
}
.chip[aria-checked="true"] {
  background: color-mix(in srgb, var(--tag) 18%, #fff);
  border-color: var(--tag);
}
.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--tag);
}
.chip.add {
  border-style: dashed;
  color: var(--muted);
}
.new-input {
  width: 9rem;
  font: inherit;
  font-size: 1rem; /* ≥16px: no iOS zoom on focus */
  padding: 0.3rem 0.8rem;
}
.new-input:focus {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.spacer {
  flex: 1;
}
button {
  all: unset;
  cursor: pointer;
  padding: 0.6rem 1.1rem;
  border-radius: 999px;
  font-weight: 500;
}
button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.primary {
  background: var(--accent);
  color: var(--accent-ink);
}
.ghost {
  color: var(--muted);
}
.delete {
  color: var(--danger);
  padding-left: 0.25rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* phones: bottom sheet */
@media (max-width: 639px) {
  .sheet {
    margin: auto 0 0;
    width: 100%;
  }
  .card {
    border-radius: 24px 24px 0 0;
    padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
  }
  .sheet[open] .card {
    animation: slide-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}
/* larger screens: centred card */
@media (min-width: 640px) {
  .sheet {
    width: min(440px, calc(100vw - 2rem));
  }
  .card {
    border-radius: 24px;
  }
  .sheet[open] .card {
    animation: pop 0.2s ease;
  }
}
@keyframes slide-up {
  from {
    transform: translateY(100%);
  }
}
@keyframes pop {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet[open] .card {
    animation: none;
  }
  .chip:active,
  .pill:not(:disabled):active {
    transform: none;
  }
  .ruler-enter-from,
  .ruler-leave-to {
    transform: none;
  }
}
</style>
