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

interface Emits {
  (event: 'confirm'): void
  (event: 'cancel'): void
}

withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})

const emit = defineEmits<Emits>()
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => !value && emit('cancel')">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-modal"
      >
        <AlertDialogTitle class="font-display text-xl font-bold text-foreground">
          {{ title }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm leading-6 text-muted-foreground">
          {{ description }}
        </AlertDialogDescription>
        <div class="flex flex-wrap justify-end gap-3 pt-2">
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
