<script setup lang="ts">
/**
 * SsoGlassModal — organism: modal dengan Liquid Glass treatment.
 *
 * Built on Reka UI Dialog primitives (focus trap, aria-modal, ESC handling).
 * Backdrop pakai blur sangat ringan + neutral-950/40 — bukan warna-warni.
 *
 * A11y:
 *  - Reka UI menyediakan focus trap, aria-modal, escape, return focus
 *  - DialogTitle wajib ada (sr-only fallback bila tidak terlihat)
 */

import type { HTMLAttributes } from 'vue'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** Title untuk a11y. Bila bukan slot title yang visible, akan jadi sr-only. */
    title: string
    /** Tampilkan title secara visual (default: true). */
    titleVisible?: boolean
    class?: HTMLAttributes['class']
  }>(),
  { titleVisible: true, class: undefined },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay
        class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[var(--glass-bg-overlay)] backdrop-blur-[var(--glass-blur-sm)] duration-[var(--duration-slow)]"
      />
      <DialogContent
        :class="
          cn(
            'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md',
            'bg-[var(--glass-bg-elevated)] backdrop-blur-[var(--glass-blur-md)]',
            'border border-[var(--glass-border-strong)]',
            'shadow-[var(--shadow-glass-lg)]',
            'rounded-[var(--radius-glass-2xl)] p-8',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]',
            'duration-[var(--duration-slow)]',
            props.class,
          )
        "
      >
        <DialogTitle
          :class="
            cn(
              props.titleVisible
                ? 'text-heading-3 font-display font-semibold tracking-tight text-[var(--text-primary)] mb-2'
                : 'sr-only',
            )
          "
        >
          {{ props.title }}
        </DialogTitle>

        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
