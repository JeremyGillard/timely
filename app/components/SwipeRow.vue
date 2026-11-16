<script setup lang="ts">
// Row that reveals a "Remove" action on swipe-left or tap/click.
// Swipe right / tap again closes it. Vertical drags scroll the page as usual.
const REVEAL = 96; // px, width of the action

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ remove: [] }>();
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
  if (!pressed) return;
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
  else if (axis === null) open.value = !open.value; // tap / click toggles
  drag.value = null;
}

function onCancel() {
  pressed = false;
  drag.value = null;
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
      :aria-expanded="open"
      :aria-label="label ? `${label}. Show remove button` : 'Show remove button'"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @keydown.enter.space.prevent="open = !open"
    >
      <slot />
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
</style>
