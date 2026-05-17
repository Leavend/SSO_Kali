<script setup lang="ts">
/**
 * SsoGlassButton — atom: button dengan Liquid Glass treatment.
 *
 * Bukan pengganti shadcn `Button` di components/ui/button. SsoGlassButton
 * dipakai untuk CTA utama auth flow (Sign in, Allow, Deny) dan OAuth
 * provider tile yang berdiri di atas glass surface. Component shadcn
 * `Button` tetap dipakai untuk action standar di portal/admin area.
 *
 * A11y (design.md §10.2):
 *  - WCAG 2.4.11 focus appearance via --ring-glass-focus
 *  - WCAG 2.5.5 touch target ≥44px (size md/lg/icon = 44px)
 *  - aria-busy aktif saat loading; spinner aria-hidden
 *  - disabled bukan hanya pointer-events: pakai attribute disabled
 */

import type { HTMLAttributes } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import SsoSpinner from '@/components/atoms/SsoSpinner.vue'

const glassButtonVariants = cva(
  [
    // Base
    'inline-flex items-center justify-center gap-2',
    'font-sans font-medium tracking-wide',
    'border rounded-[var(--radius-glass-xl)]',
    'cursor-pointer select-none',
    'transition-all duration-[var(--duration-normal)] ease-[var(--ease-smooth)]',
    // Focus — WCAG 2.4.11
    'focus-visible:outline-none',
    'focus-visible:shadow-[var(--ring-glass-focus)]',
    // Disabled
    'disabled:pointer-events-none disabled:opacity-40',
    // Subtle press feedback (Austere Precision — bukan rotateX dramatis)
    'active:scale-[0.98] active:transition-[transform] active:duration-[var(--duration-fast)]',
    // Glass body
    'backdrop-blur-[var(--glass-blur-sm)]',
    'shadow-[var(--shadow-glass-sm)]',
  ],
  {
    variants: {
      variant: {
        // Primary CTA — Sign in, Allow, etc.
        primary: [
          'bg-brand-600 border-brand-600 text-white',
          'hover:bg-brand-700 hover:border-brand-700',
          'hover:shadow-[var(--shadow-glass-md)]',
        ],
        // Glass surface button — OAuth providers
        glass: [
          'bg-[var(--glass-bg-primary)] border-[var(--glass-border-subtle)]',
          'text-[var(--text-primary)]',
          'hover:bg-[var(--glass-bg-elevated)] hover:border-[var(--glass-border-strong)]',
          'hover:shadow-[var(--shadow-glass-md)]',
        ],
        // Ghost — secondary action (Deny, escape hatch)
        ghost: [
          'bg-transparent border-transparent shadow-none',
          'text-[var(--text-secondary)]',
          'hover:text-[var(--text-primary)] hover:bg-neutral-100/60',
        ],
        // Destructive — revoke session, delete account
        destructive: [
          'bg-error-700 border-error-700 text-white',
          'hover:bg-error-800 hover:border-error-800',
        ],
      },
      size: {
        // h-9 = 36px — only for tight contexts where layout justifies it
        sm: 'h-9 px-4 text-sm rounded-[var(--radius-glass-lg)]',
        // h-11 = 44px — WCAG 2.5.5 touch target ✓
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-base',
        // 44×44 — WCAG 2.5.5 ✓
        icon: 'h-11 w-11 p-0',
        fullWidth: 'h-12 w-full px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type GlassButtonVariants = VariantProps<typeof glassButtonVariants>

const props = withDefaults(
  defineProps<{
    variant?: GlassButtonVariants['variant']
    size?: GlassButtonVariants['size']
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    /** aria-label override — wajib untuk variant="icon" tanpa visible text. */
    ariaLabel?: string
    class?: HTMLAttributes['class']
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    type: 'button',
    ariaLabel: undefined,
    class: undefined,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent): void {
  if (props.disabled || props.loading) return
  emit('click', event)
}
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled || props.loading"
    :aria-busy="props.loading || undefined"
    :aria-label="props.ariaLabel"
    :class="cn(glassButtonVariants({ variant: props.variant, size: props.size }), props.class)"
    @click="handleClick"
  >
    <SsoSpinner
      v-if="props.loading"
      size="sm"
      :tone="props.variant === 'primary' || props.variant === 'destructive' ? 'inverse' : 'default'"
    />
    <slot v-else name="leading" />

    <slot />

    <slot v-if="!props.loading" name="trailing" />
  </button>
</template>
