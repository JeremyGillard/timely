<template>
  <div class="layout">
    <slot />
    <AppNav />
    <SyncControl />
  </div>
</template>

<style scoped>
.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
