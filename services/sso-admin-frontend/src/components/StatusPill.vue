<script setup lang="ts">
import { computed } from 'vue'
import type { ReadinessState } from '@/stores/releaseReadiness'

const props = defineProps<{
  state: ReadinessState
}>()

const stateConfig = computed(() => {
  switch (props.state) {
    case 'ready':
      return { label: 'Ready', className: 'ui-badge--ready' }
    case 'guarded':
      return { label: 'Guarded', className: 'ui-badge--guarded' }
    case 'pending':
      return { label: 'Pending', className: 'ui-badge--pending' }
    default:
      return { label: props.state, className: '' }
  }
})
</script>

<template>
  <span class="ui-badge" :class="stateConfig.className">{{ stateConfig.label }}</span>
</template>

<style scoped>
.ui-badge--ready {
  color: var(--success-soft-fg);
  background: var(--success-soft);
}

.ui-badge--guarded {
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
}

.ui-badge--pending {
  color: var(--primary-soft-fg);
  background: var(--primary-soft);
}
</style>
