<script setup lang="ts">
/**
 * SsoSpinner — atom: loading indicator yang dapat dipakai di tombol, banner,
 * atau inline status (design.md §6.2 Loading States).
 *
 * Decorative: parent yang punya konteks aksi WAJIB menyediakan teks status
 * (mis. "Memproses…" + aria-live) — spinner sendiri di-aria-hidden.
 */

import type { HTMLAttributes } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    size?: Size
    /** Tailwind utility tambahan untuk root span. */
    class?: HTMLAttributes['class']
    /** Override warna stroke (mis. saat tampil di tombol primary). */
    tone?: 'default' | 'inverse' | 'brand' | 'muted'
  }>(),
  { size: 'sm', class: undefined, tone: 'default' },
)

const sizeMap: Record<Size, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
}

const toneMap: Record<NonNullable<typeof props.tone>, string> = {
  default: 'text-current',
  inverse: 'text-white',
  brand: 'text-brand-600',
  muted: 'text-[var(--text-muted)]',
}
</script>

<template>
  <span
    role="status"
    aria-hidden="true"
    :class="cn('inline-flex items-center justify-center', toneMap[props.tone], props.class)"
  >
    <Loader2 :class="cn('animate-spin', sizeMap[props.size])" />
  </span>
</template>
