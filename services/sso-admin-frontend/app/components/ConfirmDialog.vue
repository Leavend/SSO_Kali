<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})
const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>()

const backdropRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)
let triggerElement: HTMLElement | null = null
const inertElements: Array<{ element: HTMLElement; ariaHidden: string | null; inert: boolean }> = []

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

watch(
  () => props.open,
  async (open): Promise<void> => {
    if (!open) {
      restoreBackground()
      restoreTriggerFocus()
      return
    }
    triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    inertBackground()
    dialogRef.value?.focus()
  },
)

onBeforeUnmount(() => {
  restoreBackground()
  restoreTriggerFocus()
})

function getFocusableElements(): HTMLElement[] {
  return Array.from(dialogRef.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
  )
}

function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const focusableElements = getFocusableElements()
  if (focusableElements.length === 0) {
    event.preventDefault()
    dialogRef.value?.focus()
    return
  }
  const firstElement = focusableElements[0]!
  const lastElement = focusableElements[focusableElements.length - 1]!
  const activeElement = document.activeElement
  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
    return
  }
  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
    return
  }
  if (!dialogRef.value?.contains(activeElement)) {
    event.preventDefault()
    firstElement.focus()
  }
}

function inertBackground(): void {
  restoreBackground()
  const backdrop = backdropRef.value
  const parent = backdrop?.parentElement
  if (!backdrop || !parent) return
  Array.from(parent.children).forEach((child) => {
    if (child === backdrop || !(child instanceof HTMLElement)) return
    inertElements.push({
      element: child,
      ariaHidden: child.getAttribute('aria-hidden'),
      inert: child.inert === true,
    })
    child.inert = true
    child.setAttribute('aria-hidden', 'true')
  })
}

function restoreBackground(): void {
  while (inertElements.length > 0) {
    const previous = inertElements.pop()
    if (!previous) continue
    previous.element.inert = previous.inert
    if (previous.ariaHidden === null) {
      previous.element.removeAttribute('aria-hidden')
    } else {
      previous.element.setAttribute('aria-hidden', previous.ariaHidden)
    }
  }
}

function restoreTriggerFocus(): void {
  if (!triggerElement?.isConnected) {
    triggerElement = null
    return
  }
  triggerElement.focus()
  triggerElement = null
}

function confirm(): void {
  emit('confirm')
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <div v-if="open" ref="backdropRef" class="confirm-backdrop" @click.self="cancel">
    <section
      ref="dialogRef"
      class="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      tabindex="-1"
      @keydown.esc="cancel"
      @keydown.tab="trapFocus"
    >
      <h2 id="confirm-dialog-title" class="confirm-dialog__title">{{ title }}</h2>
      <p id="confirm-dialog-description" class="confirm-dialog__desc">{{ description }}</p>
      <div class="confirm-dialog__actions">
        <button
          data-testid="confirm-dialog-cancel"
          class="ui-btn ui-btn--secondary"
          type="button"
          @click="cancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          data-testid="confirm-dialog-confirm"
          class="ui-btn"
          :class="danger ? 'ui-btn--danger' : 'ui-btn--primary'"
          type="button"
          @click="confirm"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(10 10 10 / 0.4);
}
.confirm-dialog {
  width: min(460px, 100%);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.confirm-dialog:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.confirm-dialog__title {
  margin: 0 0 8px;
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.confirm-dialog__desc {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--ctl-h);
  padding: 0 14px;
  font: 500 0.8125rem/1 var(--font-sans);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ui-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-btn--secondary {
  color: var(--fg);
  background: var(--card);
  border-color: var(--border-strong);
}
.ui-btn--secondary:hover {
  background: var(--muted);
}
.ui-btn--primary {
  color: var(--accent-fg);
  background: var(--accent);
  border-color: var(--accent);
}
.ui-btn--danger {
  color: var(--danger-fg);
  background: var(--danger);
  border-color: var(--danger);
}
</style>
