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
  border-color: rgb(20 184 166 / 24%);
}

.readiness-card--guarded {
  border-color: rgb(245 158 11 / 24%);
}

.readiness-card--pending {
  border-color: rgb(99 102 241 / 24%);
}
</style>
