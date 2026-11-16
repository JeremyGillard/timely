<script setup lang="ts">
// List row:
//  - tap / click / Enter  → emits `select` (opens the note editor, which also has Delete)
//  - touch swipe-left     → reveals a "Remove" action (swipe right / tap closes); no mouse drag
// Vertical drags scroll the page as usual.
const REVEAL = 96; // px, width of the swipe action

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ select: []; remove: [] }>();
defineProps<{ label?: string }>();

const drag = ref<number | null>(null); // live offset while dragging horizontally
const offset = computed(() => drag.value ?? (open.value ? -REVEAL : 0));

let pressed = false;
let startX = 0;
let startY = 0;
let base = 0;
let axis: "x" | "y" | null = null;

function onDown(e: PointerEvent) {
  if (e.button !== 0) return;
  pressed = true;
  startX = e.clientX;
  startY = e.clientY;
  base = open.value ? -REVEAL : 0;
  axis = null;
}

function onMove(e: PointerEvent) {
  if (!pressed || e.pointerType === "mouse") return; // swipe is touch/pen only
  const mx = e.clientX - startX;
  const my = e.clientY - startY;
  if (!axis) {
    if (Math.hypot(mx, my) < 6) return; // still a tap
    axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    if (axis === "x") (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  if (axis !== "x") return;
  let v = base + mx;
  // rubber-band past either end
  if (v > 0) v /= 4;
  else if (v < -REVEAL) v = -REVEAL + (v + REVEAL) / 4;
  drag.value = v;
}

function onUp() {
  if (!pressed) return;
  pressed = false;
  if (axis === "x") open.value = (drag.value ?? 0) < -REVEAL / 2;
  else if (axis === null) tap();
  drag.value = null;
}

function onCancel() {
  pressed = false;
  drag.value = null;
}

function tap() {
  if (open.value) open.value = false;
  else emit("select");
}
</script>

<template>
  <div class="swipe" :class="{ open }" :style="{ '--reveal': `${REVEAL}px` }">
    <button
      type="button"
      class="action"
      :tabindex="open ? 0 : -1"
      :aria-hidden="!open"
      :style="{ opacity: Math.min(1, -offset / REVEAL) }"
      @click="emit('remove')"
    >
      Remove
    </button>
    <div
      class="content"
      :class="{ dragging: drag !== null }"
      :style="{ transform: `translateX(${offset}px)` }"
      role="button"
      tabindex="0"
      :aria-label="label ? `${label}. Edit note` : 'Edit note'"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @keydown.enter.space.self.prevent="tap"
    >
      <div class="slot">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.swipe {
  position: relative;
  overflow: hidden;
}
.action {
  all: unset;
  position: absolute;
  inset: 0 0 0 auto;
  width: var(--reveal);
  display: grid;
  place-items: center;
  background: var(--danger);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}
.action:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -4px;
}
.content {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg);
  cursor: pointer;
  touch-action: pan-y; /* vertical = page scroll, horizontal = swipe */
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.content.dragging {
  transition: none;
}
.content:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}
.slot {
  flex: 1;
  min-width: 0;
}
</style>
