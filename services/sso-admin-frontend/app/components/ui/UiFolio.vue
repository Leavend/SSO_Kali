<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  readonly index?: number
  readonly total?: number
  readonly value?: string
  readonly pad?: number
  readonly variant?: 'count' | 'id' | 'timestamp'
}

const props = withDefaults(defineProps<Props>(), {
  index: undefined,
  total: undefined,
  value: undefined,
  pad: undefined,
  variant: 'count',
})

const width = computed<number>(() => {
  if (props.pad != null) return Math.max(props.pad, 2)
  if (props.total != null) return Math.max(String(props.total).length, 2)
  return 2
})

function zero(value: number): string {
  return String(value).padStart(width.value, '0')
}

const display = computed<string>(() => {
  if (props.value != null) return props.value
  if (props.index != null && props.total != null)
    return `${zero(props.index)} / ${zero(props.total)}`
  if (props.index != null) return zero(props.index)
  return ''
})

const isMono = computed<boolean>(() => props.variant === 'id')
const isCondensed = computed<boolean>(() => !isMono.value)
</script>

<template>
  <span
    class="ui-folio"
    :class="{ 'ui-folio--mono': isMono, 'ui-folio--condensed': isCondensed }"
    >{{ display }}</span
  >
</template>

<style scoped>
.ui-folio {
  font: 500 0.75rem/1 var(--font-sans);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: var(--fg-2);
  white-space: nowrap;
}
.ui-folio--condensed {
  font-family: var(--font-condensed);
  font-stretch: 75%;
}
.ui-folio--mono {
  font-family: var(--font-mono);
  font-stretch: normal;
  font-variant-numeric: normal;
  letter-spacing: 0;
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
