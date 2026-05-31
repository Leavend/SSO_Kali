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

interface Emits {
  (event: 'confirm'): void
  (event: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})
const emit = defineEmits<Emits>()
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
  <div v-if="open" ref="backdropRef" class="confirm-dialog-backdrop" @click.self="cancel">
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
        <p class="eyebrow">Konfirmasi aksi admin</p>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
        <p id="confirm-dialog-description">{{ description }}</p>
        <div class="action-row compact-actions">
          <button
            data-testid="confirm-dialog-cancel"
            class="secondary-action"
            type="button"
            @click="cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            data-testid="confirm-dialog-confirm"
            :class="danger ? 'danger-action' : 'primary-action'"
            type="button"
            @click="confirm"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </section>
  </div>
</template>
