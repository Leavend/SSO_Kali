<script setup lang="ts">
import StatusPill from '@/components/StatusPill.vue'
import type { ReadinessItem } from '@/stores/releaseReadiness'

defineProps<{
  item: ReadinessItem
}>()
</script>

<template>
  <article class="readiness-card">
    <StatusPill :state="item.state" />
    <h2>{{ item.label }}</h2>
    <p>{{ item.detail }}</p>
  </article>
</template>
