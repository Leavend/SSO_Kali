<script setup lang="ts">
/**
 * SsoGlassCard — molecule: auth card kanonik untuk Portal SSO.
 *
 * Membungkus SsoGlassSurface + layout slot (header/main/footer) dengan
 * dimensi default sesuai design.md §3.3 (max-w-[448px], p-8).
 *
 * Catatan ukuran:
 *  - default size: max-w-md (≈28rem / 448px) — login, MFA, forgot
 *  - wide size:    max-w-lg (≈32rem / 512px) — consent page
 */

import type { HTMLAttributes } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import SsoGlassSurface from '@/components/atoms/SsoGlassSurface.vue'

const cardVariants = cva(['w-full mx-auto p-8'], {
  variants: {
    size: {
      default: 'max-w-md', // 28rem / 448px
      wide: 'max-w-lg', // 32rem / 512px (consent)
    },
  },
  defaultVariants: { size: 'default' },
})

export type GlassCardVariants = VariantProps<typeof cardVariants>

const props = withDefaults(
  defineProps<{
    size?: GlassCardVariants['size']
    /** Element semantik root — default 'section' agar struktur halaman jelas. */
    as?: 'section' | 'article' | 'div'
    /** aria-labelledby — id heading utama dalam card. */
    ariaLabelledby?: string
    class?: HTMLAttributes['class']
  }>(),
  {
    size: 'default',
    as: 'section',
    ariaLabelledby: undefined,
    class: undefined,
  },
)
</script>

<template>
  <SsoGlassSurface
    variant="default"
    :as="props.as"
    :aria-labelledby="props.ariaLabelledby"
    :class="cn(cardVariants({ size: props.size }), props.class)"
  >
    <header v-if="$slots.header" class="mb-6 grid gap-2">
      <slot name="header" />
    </header>

    <slot />

    <footer
      v-if="$slots.footer"
      class="mt-6 pt-5 border-t border-[var(--glass-border-subtle)] text-center text-[var(--text-muted)] text-xs leading-relaxed"
    >
      <slot name="footer" />
    </footer>
  </SsoGlassSurface>
</template>
