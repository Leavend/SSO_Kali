<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

/**
 * Right-side slide-over (detail drawer) — Bontang DS.
 *
 * Self-contained dialog with manual focus management so the detail content
 * renders inline & synchronously (the pages it hosts have test suites that
 * query the detail DOM directly). Provides the full dialog a11y contract:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - focus moves into the panel on open, is trapped (Tab / Shift+Tab cycle)
 *   - Escape closes
 *   - focus is restored to the previously-focused trigger on close
 *   - backdrop click closes
 * The slide/fade animation is disabled under `prefers-reduced-motion`
 * (see `.drawer-*` rules in main.css).
 */
const props = defineProps<{
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  /** Screen-reader description; visually hidden. */
  readonly description: string
  readonly closeLabel: string
  /** Wider panel for detail-heavy surfaces (forms, tabs). */
  readonly wide?: boolean
}>()

const emit = defineEmits<{ (event: 'close'): void }>()

const panelRef = ref<HTMLElement | null>(null)
const closeRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  const root = panelRef.value
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true')
}

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const active = document.activeElement as HTMLElement | null
  if (event.shiftKey && (active === first || !panelRef.value?.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null
      void nextTick(() => {
        closeRef.value?.focus()
      })
    } else if (!isOpen && wasOpen) {
      previouslyFocused?.focus?.()
      previouslyFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  previouslyFocused?.focus?.()
})
</script>

<template>
  <div v-if="props.open" class="drawer-root" @keydown="onKeydown">
    <div class="drawer-overlay" data-testid="drawer-overlay" @click="close"></div>
    <div
      ref="panelRef"
      class="drawer-content"
      :class="{ 'drawer-content--wide': props.wide }"
      :data-drawer-id="titleId"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${titleId}-title`"
      :aria-describedby="`${titleId}-desc`"
    >
      <header class="drawer-header">
        <h2 :id="`${titleId}-title`" class="drawer-title">{{ title }}</h2>
        <button
          ref="closeRef"
          type="button"
          class="drawer-close"
          :aria-label="closeLabel"
          @click="close"
        >
          <X :size="18" aria-hidden="true" />
        </button>
      </header>
      <p :id="`${titleId}-desc`" class="sr-only">{{ description }}</p>
      <div class="drawer-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="drawer-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
