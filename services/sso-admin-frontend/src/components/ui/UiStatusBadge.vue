<script setup lang="ts">
import { computed } from 'vue'
import { resolveStatusTone } from '@/lib/status-tone'

/**
 * `.status[data-tone]` badge (Bontang DS). Accepts either a canonical tone or a
 * domain status alias via `status`; an explicit `tone` overrides the alias map.
 *
 * Accessibility: the status word is rendered as real text (never colour-only),
 * preceded by a decorative tone dot. The dot is `aria-hidden` so screen readers
 * announce only the label.
 */
const props = defineProps<{
  /** Domain status string (e.g. "active", "locked", "pending") — mapped to a tone. */
  readonly status?: string | null
  /** Explicit tone override; wins over the alias mapping of `status`. */
  readonly tone?: 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'
  /** Visible label; defaults to the raw `status` text. */
  readonly label?: string
}>()

const resolvedTone = computed(() => props.tone ?? resolveStatusTone(props.status))
const text = computed(() => props.label ?? props.status ?? '—')
</script>

<template>
  <span class="status" :data-tone="resolvedTone">
    <span class="status__dot" aria-hidden="true"></span>
    <span class="status__label">{{ text }}</span>
  </span>
</template>
