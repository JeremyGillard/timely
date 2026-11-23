<script setup lang="ts">
// New deploy installed by the service worker → offer to reload into it.
const { $pwa } = useNuxtApp();

async function applyUpdate() {
  // The library only reloads for updates it classifies as its own; a second update in the
  // session that first installed the worker counts as "external" and would never reload.
  // So reload ourselves once the new worker takes control (or now, if none is waiting).
  const sw = navigator.serviceWorker;
  sw.addEventListener("controllerchange", () => location.reload(), { once: true });
  const reg = await sw.getRegistration();
  if (!reg?.waiting) return location.reload();
  await $pwa?.updateServiceWorker();
}
</script>

<template>
  <div class="app">
    <NuxtPwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UndoToast
      :message="$pwa?.needRefresh ? 'Update available' : null"
      action="Reload"
      @action="applyUpdate"
    />
  </div>
</template>
