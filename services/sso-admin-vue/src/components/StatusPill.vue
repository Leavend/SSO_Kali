<script setup lang="ts">
import type { ReadinessState } from '@/stores/releaseReadiness'

defineProps<{
  state: ReadinessState
}>()
</script>

<template>
  <span class="status-pill">{{ state }}</span>
</template>
