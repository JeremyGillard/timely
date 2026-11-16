<script setup lang="ts">
useHead({ title: "Stats · Timely" });
</script>

<template>
  <main class="page">
    <h1 class="page-title">Stats</h1>
    <section class="empty">
      <p class="lead">Coming soon</p>
      <p class="hint">Trends, averages and streaks from your tracked time will live here.</p>
    </section>
  </main>
</template>

<style scoped>
.empty {
  flex: 1;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 0.5rem;
  padding: 2rem 0;
}
.lead {
  margin: 0;
  font-size: clamp(1.6rem, 6vw, 2.2rem);
  font-weight: 300;
  letter-spacing: -0.02em;
}
.hint {
  margin: 0 auto;
  max-width: 28ch;
  color: var(--muted);
}
</style>
