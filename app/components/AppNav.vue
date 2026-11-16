<script setup lang="ts">
// Main navigation. < 1024px: bottom tab bar (icon + small label, lime pill on the active tab).
// ≥ 1024px: floating pill nav, top-right.
const items = [
  { to: "/", label: "Track", icon: "track" },
  { to: "/week", label: "Week", icon: "week" },
  { to: "/stats", label: "Stats", icon: "stats" },
] as const;
</script>

<template>
  <nav class="nav" aria-label="Main">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="item"
      exact-active-class="active"
    >
      <span class="icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <template v-if="item.icon === 'track'">
            <circle cx="12" cy="13.5" r="7.5" />
            <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5" />
          </template>
          <template v-else-if="item.icon === 'week'">
            <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </template>
          <template v-else>
            <path d="M5 20v-8M12 20V5M19 20v-5" />
          </template>
        </svg>
      </span>
      <span class="label">{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.item {
  color: var(--muted);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.item:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  border-radius: 12px;
}
.item.active {
  color: var(--ink);
}
.icon {
  display: grid;
  place-items: center;
  border-radius: 999px;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}
.icon svg {
  width: 22px;
  height: 22px;
}
.item.active .icon {
  background: var(--accent);
}

/* ---------- phones + tablets: bottom tab bar ---------- */
@media (max-width: 1023px) {
  .nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 10;
    display: flex;
    justify-content: space-around;
    height: calc(var(--nav-h) + env(safe-area-inset-bottom));
    padding: 0.4rem max(0.5rem, env(safe-area-inset-right)) env(safe-area-inset-bottom)
      max(0.5rem, env(safe-area-inset-left));
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: saturate(1.4) blur(16px);
    -webkit-backdrop-filter: saturate(1.4) blur(16px);
    border-top: 1px solid color-mix(in srgb, var(--dot-light) 70%, transparent);
  }
  .item {
    flex: 1;
    max-width: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }
  .icon {
    width: 56px;
    height: 30px;
  }
  .item:active .icon {
    transform: scale(0.94);
  }
  .label {
    font-size: 0.7rem;
    letter-spacing: 0.01em;
  }
  .item.active .label {
    font-weight: 600;
  }
}

/* ---------- desktop: floating pill, top-right ---------- */
@media (min-width: 1024px) {
  .nav {
    position: fixed;
    top: calc(1.75rem + env(safe-area-inset-top));
    right: 2rem;
    z-index: 10;
    display: flex;
    gap: 0.25rem;
    padding: 0.3rem;
    border-radius: 999px;
    background: color-mix(in srgb, #fff 55%, transparent);
    border: 1px solid color-mix(in srgb, var(--dot-light) 60%, transparent);
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px -16px rgb(0 0 0 / 0.25);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 1rem 0.45rem 0.7rem;
    border-radius: 999px;
    font-size: 0.92rem;
    transition: background-color 0.2s ease;
  }
  .item:hover {
    color: var(--ink);
  }
  .item.active {
    background: var(--accent);
  }
  .item.active .icon {
    background: none;
  }
}
</style>
