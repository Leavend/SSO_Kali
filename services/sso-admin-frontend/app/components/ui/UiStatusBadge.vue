<script setup lang="ts">
import { computed } from 'vue'
import { resolveStatusTone, type StatusTone } from '@/lib/status-tone'

/** Swiss status badge: a sharp hairline rectangle pairing a tone dot (shape)
 *  with a real text label (never colour-alone). */
const props = defineProps<{
  readonly status?: string | null
  readonly tone?: StatusTone
  readonly label?: string
}>()

const resolvedTone = computed<StatusTone>(() => props.tone ?? resolveStatusTone(props.status))
const text = computed<string>(() => props.label ?? props.status ?? '—')
</script>

<template>
  <span class="status" :data-tone="resolvedTone">
    <span class="status__dot" aria-hidden="true"></span>
    <span class="status__label">{{ text }}</span>
  </span>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font: 600 0.6875rem/1.4 var(--font-sans);
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.status__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: var(--r-full);
}
.status[data-tone='success'] {
  color: var(--success-soft-fg);
  background: var(--success-soft);
  border-color: var(--success-soft-fg);
}
.status[data-tone='warning'] {
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border-color: var(--warning-soft-fg);
}
.status[data-tone='danger'] {
  color: var(--danger-soft-fg);
  background: var(--danger-soft);
  border-color: var(--danger-soft-fg);
}
.status[data-tone='info'] {
  color: var(--info-soft-fg);
  background: var(--info-soft);
  border-color: var(--info-soft-fg);
}
.status[data-tone='brand'] {
  color: var(--accent-soft-fg);
  background: var(--accent-soft);
  border-color: var(--accent-soft-fg);
}
</style>
