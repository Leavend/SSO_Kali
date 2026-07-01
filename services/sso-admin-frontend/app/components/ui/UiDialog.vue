<script setup lang="ts">
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
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
</script>

<template>
  <Teleport to="body" :disabled="isTest">
    <div v-if="open" class="ui-dialog-wrapper">
      <div :class="['ui-modal-overlay', props.overlayClass]" @click="emit('close')" />
      <div
        :class="['ui-modal', { 'ui-modal--wide': props.wide }]"
        :data-dialog-id="titleId"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <div class="ui-modal__header">
          <h2 :id="titleId" class="ui-modal__title">{{ title }}</h2>
          <button class="ui-modal__close" type="button" :aria-label="closeLabel" @click="emit('close')">
            <X :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="sr-only">{{ description }}</div>
        <div class="ui-modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-dialog-wrapper {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ui-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}
.ui-modal {
  position: relative;
  z-index: 1101;
  width: min(92vw, 32rem);
  max-height: 90vh;
  overflow: auto;
  padding: 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
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
  font: 600 1.125rem/1.2 var(--font-sans);
  letter-spacing: -0.015em;
  color: var(--fg);
}
.ui-modal__close {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: all 0.15s ease;
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
