<script setup lang="ts">
import { computed } from 'vue'
import type { ReadinessState } from '@/stores/releaseReadiness'

const props = defineProps<{
  state: ReadinessState
}>()

const stateConfig = computed(() => {
  switch (props.state) {
    case 'ready':
      return { label: 'Ready', className: 'status-pill--ready' }
    case 'guarded':
      return { label: 'Guarded', className: 'status-pill--guarded' }
    case 'pending':
      return { label: 'Pending', className: 'status-pill--pending' }
    default:
      return { label: props.state, className: '' }
  }
})
</script>

<template>
  <span class="status-pill" :class="stateConfig.className">{{ stateConfig.label }}</span>
</template>

<style scoped>
.status-pill--ready {
  color: #ccfbf1;
  background: rgb(20 184 166 / 14%);
}

.status-pill--guarded {
  color: #fef3c7;
  background: rgb(245 158 11 / 14%);
}

.status-pill--pending {
  color: #e0e7ff;
  background: rgb(99 102 241 / 14%);
}
</style>
