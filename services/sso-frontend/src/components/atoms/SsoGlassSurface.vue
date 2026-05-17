<script setup lang="ts">
/**
 * SsoGlassSurface — atom: container dengan Liquid Glass treatment.
 *
 * Restrained Glass (design.md §2.1) — translucency yang terasa,
 * bukan flashy. Dipakai sebagai dasar SsoGlassCard, SsoGlassModal,
 * dan section auth yang butuh kesan premium tanpa drama.
 *
 * A11y: surface struktural — komponen pembungkus (modal/card)
 * yang bertanggung jawab atas semantik ARIA.
 */

import type { HTMLAttributes } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const surfaceVariants = cva(
  [
    'relative',
    // Heavier blur so vibrant blobs become real "liquid glass" through the surface.
    'backdrop-blur-[var(--glass-blur-lg)]',
    'border border-[var(--glass-border-subtle)]',
    'transition-all duration-[var(--duration-normal)] ease-[var(--ease-smooth)]',
  ],
  {
    variants: {
      variant: {
        // Default: auth card, form container
        default: [
          'bg-[var(--glass-bg-primary)]',
          'shadow-[var(--shadow-glass-md)]',
          'rounded-[var(--radius-glass-2xl)]',
        ],
        // Elevated: modal, dialog, top-of-stack panels
        elevated: [
          'bg-[var(--glass-bg-elevated)]',
          'shadow-[var(--shadow-glass-lg)]',
          'rounded-[var(--radius-glass-2xl)]',
          'border-[var(--glass-border-strong)]',
        ],
        // Subtle: inner section block (mis. consent identity card)
        subtle: [
          'bg-[var(--glass-bg-primary)]',
          'shadow-none',
          'rounded-[var(--radius-glass-xl)]',
          'border-dashed',
        ],
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type SurfaceVariants = VariantProps<typeof surfaceVariants>

const props = withDefaults(
  defineProps<{
    variant?: SurfaceVariants['variant']
    /** Element tag — default 'div'. Use 'section' / 'aside' bila relevan. */
    as?: keyof HTMLElementTagNameMap
    class?: HTMLAttributes['class']
  }>(),
  {
    variant: 'default',
    as: 'div',
    class: undefined,
  },
)
</script>

<template>
  <component
    :is="props.as"
    data-slot="glass-surface"
    :class="cn(surfaceVariants({ variant: props.variant }), props.class)"
  >
    <slot />
  </component>
</template>
