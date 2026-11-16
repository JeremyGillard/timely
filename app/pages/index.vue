<script setup lang="ts">
useHead({ title: "Timesheet" });

const HOLD_MS = 3000;

const { windows, active, load, next, stop } = useTimeWindows();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  load();
  now.value = Date.now();
  tick = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => clearInterval(tick));

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

const startOfToday = computed(() => new Date(now.value).setHours(0, 0, 0, 0));
const today = computed(() =>
  windows.value.filter((w) => w.start >= startOfToday.value).toReversed(),
);
const todayTotal = computed(() =>
  today.value.reduce((sum, w) => sum + ((w.end ?? now.value) - w.start), 0),
);

function duration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":"); // HH:MM:SS
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const hint = computed(() =>
  active.value
    ? `Tap to start a new window · Hold ${HOLD_MS / 1000} s to stop`
    : "Tap to start a window",
);
</script>

<template>
  <main>
    <h1>Timesheet</h1>

    <section class="timer">
      <!-- keyed per window: rings restart from 12 o'clock -->
      <DottedRings :key="active?.id ?? 'idle'" :started-at="active?.start">
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

    <section v-if="today.length" class="log">
      <div class="log-head">
        <span>Today</span>
        <span>{{ duration(todayTotal) }}</span>
      </div>
      <ol>
        <li v-for="w in today" :key="w.id" :class="{ live: !w.end }">
          <span>{{ clock(w.start) }} – {{ w.end ? clock(w.end) : "now" }}</span>
          <span>{{ duration((w.end ?? now) - w.start) }}</span>
        </li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
main {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: clamp(1.5rem, 5vw, 3rem);
}
h1 {
  margin: 0;
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}
@media (max-width: 640px) {
  main {
    padding-top: clamp(3rem, 12vh, 5rem);
  }
  h1 {
    text-align: center;
    font-size: clamp(3rem, 14vw, 4.5rem);
  }
}

.timer {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 0;
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
  justify-content: space-between;
  font-weight: 500;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--dot-light);
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 0;
  border-bottom: 1px dotted var(--dot-light);
  color: var(--muted);
}
li.live {
  color: var(--ink);
}
</style>
