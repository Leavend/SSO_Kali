<script setup lang="ts">
interface Props {
  readonly rows?: number
  readonly label?: string
}

withDefaults(defineProps<Props>(), {
  rows: 4,
  label: 'Loading',
})
</script>

<template>
  <div class="ui-skeleton" role="status" :aria-label="label">
    <span
      v-for="index in rows"
      :key="index"
      data-testid="ui-skeleton-row"
      class="ui-skeleton__row"
      :style="{ '--skeleton-width': `${100 - (index % 3) * 12}%` }"
    />
  </div>
</template>

<style scoped>
.ui-skeleton {
  display: grid;
  gap: 10px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.ui-skeleton__row {
  width: var(--skeleton-width, 100%);
  height: 12px;
  background: var(--muted-2);
  border-radius: var(--r-sm);
  animation: ui-skeleton-pulse 1.4s ease-in-out infinite;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}
@keyframes ui-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton__row {
    animation: none;
  }
}
</style>
