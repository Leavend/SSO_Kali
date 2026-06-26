<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useCountUp } from '@/composables/useCountUp'

const props = defineProps<{
  value: number
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}>()

// Animate from 0 → value on mount. The composable seeds the display with the
// final value and snaps to it instantly under prefers-reduced-motion (and in
// non-animating environments), so the true number is always in the DOM.
const { display } = useCountUp(toRef(props, 'value'))

const toneClass = computed(() => `dashboard-counter-value--${props.tone}`)
</script>

<template>
  <dd class="dashboard-counter-value" :class="toneClass">{{ display }}</dd>
</template>
