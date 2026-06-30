<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
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
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => !value && emit('cancel')">
    <AlertDialogPortal disabled force-mount>
      <AlertDialogOverlay class="ui-alert-overlay" />
      <AlertDialogContent class="ui-alert">
        <AlertDialogTitle class="ui-alert__title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="ui-alert__desc">{{ description }}</AlertDialogDescription>
        <div class="ui-alert__actions">
          <AlertDialogCancel as-child>
            <UiButton data-testid="ui-alert-dialog-cancel" variant="secondary">
              {{ cancelLabel }}
            </UiButton>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="emit('confirm')">
            <UiButton
              data-testid="ui-alert-dialog-confirm"
              :variant="danger ? 'danger' : 'primary'"
            >
              {{ confirmLabel }}
            </UiButton>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
.ui-alert-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.ui-alert {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  transform: translate(-50%, -50%);
  display: grid;
  gap: 14px;
  width: min(92vw, 32rem);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-alert__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.ui-alert__desc {
  font: 400 0.8125rem/1.5 var(--font-sans);
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
