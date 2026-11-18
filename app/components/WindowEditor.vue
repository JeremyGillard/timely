<script setup lang="ts">
// Edit a time window's label/note. Native <dialog>: Esc / backdrop click close it.
// Phones: bottom sheet. Larger screens: centred card.
import type { Tag, TimeWindow } from "~/composables/useTimeWindows";

// `tags` comes ordered most-recently-used first.
const props = defineProps<{ window: TimeWindow | null; now: number; tags: Tag[] }>();
const emit = defineEmits<{
  close: [];
  save: [note: string];
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
      order.value = props.tags.map((t) => t.id);
      adding.value = false;
      if (!el.open) el.showModal();
      input.value?.focus();
    } else if (el.open) {
      el.close();
    }
  },
  { flush: "post" },
);

function save() {
  emit("save", draft.value);
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
      <header>
        <h2 id="window-editor-title">
          {{ clock(window.start) }} – {{ window.end ? clock(window.end) : "now" }}
        </h2>
        <span class="duration">{{ duration((window.end ?? now) - window.start) }}</span>
      </header>

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
        <button type="button" class="delete" @click="emit('delete')">Delete</button>
        <span class="spacer" />
        <button type="button" class="ghost" @click="emit('close')">Cancel</button>
        <button type="submit" class="primary">Save</button>
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
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.01em;
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
  .chip:active {
    transform: none;
  }
}
</style>
