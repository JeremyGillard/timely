<template>
  <div class="layout">
    <slot />
    <AppNav />
  </div>
</template>

<style scoped>
.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
