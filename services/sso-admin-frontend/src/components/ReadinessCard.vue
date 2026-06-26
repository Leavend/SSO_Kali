<script setup lang="ts">
import StatusPill from '@/components/StatusPill.vue'
import type { ReadinessItem } from '@/stores/releaseReadiness'

defineProps<{
  item: ReadinessItem
}>()
</script>

<template>
  <article class="readiness-card" :class="`readiness-card--${item.state}`">
    <StatusPill :state="item.state" />
    <h2>{{ item.label }}</h2>
    <p>{{ item.detail }}</p>
  </article>
</template>

<style scoped>
.readiness-card--ready {
  border-color: color-mix(in oklch, var(--success) 24%, transparent);
}

.readiness-card--guarded {
  border-color: color-mix(in oklch, var(--warning) 24%, transparent);
}

.readiness-card--pending {
  border-color: color-mix(in oklch, var(--primary) 24%, transparent);
}
</style>
