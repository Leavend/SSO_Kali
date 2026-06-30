<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  readonly description: string
  readonly closeLabel: string
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

<style scoped>
.drawer-root {
  position: fixed;
  inset: 0;
  z-index: 1100;
}
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.drawer-content {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1101;
  display: flex;
  flex-direction: column;
  width: min(440px, 100vw);
  max-width: 100vw;
  background: var(--card);
  border-left: 1px solid var(--border-strong);
}
.drawer-content--wide {
  width: min(680px, 100vw);
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.drawer-title {
  margin: 0;
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.drawer-close {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.drawer-close:hover {
  background: var(--muted);
  color: var(--fg);
}
.drawer-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.drawer-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
}
.drawer-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip: rect(0, 0, 0, 0);
}
</style>
