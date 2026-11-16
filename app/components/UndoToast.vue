<script setup lang="ts">
// Small dark toast with an action, floating above the bottom nav (or bottom-centre on desktop).
defineProps<{ message: string | null; action?: string }>();
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite">
    <Transition name="toast">
      <div v-if="message" class="toast">
        <span class="message">{{ message }}</span>
        <button type="button" class="action" @click="emit('action')">{{ action ?? "Undo" }}</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  left: 50%;
  bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 0.5rem);
  transform: translateX(-50%);
  z-index: 20;
  width: max-content;
  max-width: calc(100vw - 2rem);
  pointer-events: none;
}
@media (min-width: 1024px) {
  .toast-region {
    bottom: calc(2rem + env(safe-area-inset-bottom));
  }
}
.toast {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 0.55rem 0.55rem 1.1rem;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  box-shadow: 0 12px 30px -12px rgb(0 0 0 / 0.45);
  font-size: 0.92rem;
  pointer-events: auto;
}
.message {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.action {
  all: unset;
  flex-shrink: 0;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
  cursor: pointer;
}
.action:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 0.2s ease;
  }
  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
