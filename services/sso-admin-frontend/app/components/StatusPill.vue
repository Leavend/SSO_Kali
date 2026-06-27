<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { StatusTone } from '@/lib/status-tone'

/** Release-readiness states are owned here (design-system source of truth);
 *  the dashboard store imports this type rather than the reverse. */
export type ReadinessState = 'ready' | 'guarded' | 'pending'

const props = defineProps<{ state: ReadinessState }>()

const config = computed<{ label: string; tone: StatusTone }>(() => {
  switch (props.state) {
    case 'ready':
      return { label: 'Ready', tone: 'brand' }
    case 'guarded':
      return { label: 'Guarded', tone: 'warning' }
    case 'pending':
      return { label: 'Pending', tone: 'info' }
    default:
      return { label: props.state, tone: 'neutral' }
  }
})
</script>

<template>
  <UiStatusBadge :tone="config.tone" :label="config.label" />
</template>
