<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from 'lucide-vue-next'

interface Props {
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  readonly description: string
  readonly closeLabel: string
  readonly overlayClass?: string
  readonly wide?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  overlayClass: undefined,
  wide: false,
})
const emit = defineEmits<{ (event: 'close'): void }>()

function handleOpenChange(open: boolean): void {
  if (!open) emit('close')
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal disabled force-mount>
      <DialogOverlay :class="['ui-modal-overlay', props.overlayClass]" />
      <DialogContent
        :class="['ui-modal', { 'ui-modal--wide': props.wide }]"
        :data-dialog-id="titleId"
      >
        <div class="ui-modal__header">
          <DialogTitle class="ui-modal__title">{{ title }}</DialogTitle>
          <DialogClose class="ui-modal__close" :aria-label="closeLabel">
            <X :size="18" aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription class="sr-only">{{ description }}</DialogDescription>
        <div class="ui-modal__body">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.ui-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  transform: translate(-50%, -50%);
  width: min(92vw, 32rem);
  max-height: 90vh;
  overflow: auto;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-modal--wide {
  width: min(94vw, 48rem);
}
.ui-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.ui-modal__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.ui-modal__close {
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
.ui-modal__close:hover {
  background: var(--muted);
  color: var(--fg);
}
.ui-modal__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.ui-modal__body {
  padding-top: 16px;
}
</style>
