<script setup lang="ts">
import UiButton from './UiButton.vue'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})

const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>()
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
</script>

<template>
  <Teleport to="body" :disabled="isTest">
    <div v-if="open" class="ui-alert-wrapper">
      <div class="ui-alert-overlay" @click="emit('cancel')" />
      <div class="ui-alert" role="alertdialog" aria-modal="true">
        <h2 class="ui-alert__title">{{ title }}</h2>
        <p class="ui-alert__desc">{{ description }}</p>
        <div class="ui-alert__actions">
          <UiButton data-testid="ui-alert-dialog-cancel" variant="secondary" @click="emit('cancel')">
            {{ cancelLabel }}
          </UiButton>
          <UiButton
            data-testid="ui-alert-dialog-confirm"
            :variant="danger ? 'danger' : 'primary'"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-alert-wrapper {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ui-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}
.ui-alert {
  position: relative;
  z-index: 1101;
  display: grid;
  gap: 14px;
  width: min(92vw, 32rem);
  padding: 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
}
.ui-alert__title {
  font: 600 1.125rem/1.2 var(--font-sans);
  letter-spacing: -0.015em;
  color: var(--fg);
}
.ui-alert__desc {
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ui-alert__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}
</style>
