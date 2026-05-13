<script setup lang="ts">
/**
 * SsoAlertBanner — molecule: inline alert untuk error/success/info/warning.
 * Memenuhi design.md §5.1 & §7.2 (role="alert", aria-live, warna WCAG).
 */

import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

type Tone = 'error' | 'success' | 'warning' | 'info'

const props = withDefaults(
  defineProps<{
    tone?: Tone
    message: string
    /** Custom class merge. */
    class?: string
  }>(),
  { tone: 'error', class: undefined },
)

const toneClass = computed<string>(() => {
  if (props.tone === 'success') return 'border-success-700/40 bg-success-50 text-success-700'
  if (props.tone === 'warning') return 'border-warning-800/40 bg-warning-50 text-warning-800'
  if (props.tone === 'info') return 'border-info-700/40 bg-info-50 text-info-700'
  return 'border-error-700/40 bg-error-50 text-error-700'
})

const Icon = computed(() => {
  if (props.tone === 'success') return CheckCircle2
  if (props.tone === 'warning') return AlertTriangle
  if (props.tone === 'info') return Info
  return XCircle
})

const ariaLive = computed<'assertive' | 'polite'>(() =>
  props.tone === 'error' || props.tone === 'warning' ? 'assertive' : 'polite',
)
</script>

<template>
  <p
    role="alert"
    :aria-live="ariaLive"
    :class="
      cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-relaxed',
        toneClass,
        $props.class,
      )
    "
  >
    <component :is="Icon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span>{{ props.message }}</span>
  </p>
</template>
