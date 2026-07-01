<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { formatSupportReference } from '@/lib/display-identifiers'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
  readonly reasonLabel?: string
  readonly reasonRequired?: boolean
  readonly reasonMin?: number
  readonly reasonMax?: number
  readonly reason?: string
  readonly submitting?: boolean
  readonly stepUpUrl?: string | null
  readonly stepUpLabel?: string
  readonly errorMessage?: string | null
  readonly requestId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
  reasonLabel: '',
  reasonRequired: false,
  reasonMin: 0,
  reasonMax: 255,
  reason: '',
  submitting: false,
  stepUpUrl: null,
  stepUpLabel: '',
  errorMessage: null,
  requestId: null,
})

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
  (event: 'update:reason', value: string): void
}>()

const showReason = computed(() => props.reasonLabel.length > 0)

const reasonValid = computed(() => {
  if (!props.reasonRequired) return true
  const length = props.reason.trim().length
  return length >= (props.reasonMin || 1) && length <= props.reasonMax
})

const confirmDisabled = computed(() => props.submitting || !reasonValid.value)

const supportReference = computed(() => formatSupportReference(props.requestId))

function onCancel(): void {
  emit('cancel')
}
const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
</script>

<template>
  <Teleport to="body" :disabled="isTest">
    <div v-if="open" class="pa-dialog-wrapper">
      <div class="pa-dialog__overlay" data-testid="privileged-action-overlay" @click="onCancel" />
      <div class="pa-dialog" role="alertdialog" aria-modal="true">
        <h2 class="pa-dialog__title">{{ title }}</h2>
        <p class="pa-dialog__impact" data-testid="privileged-action-impact">
          {{ description }}
        </p>

        <div v-if="showReason" class="pa-dialog__field">
          <label class="pa-dialog__label" for="privileged-action-reason">{{ reasonLabel }}</label>
          <UiTextarea
            id="privileged-action-reason"
            data-testid="privileged-action-reason"
            :model-value="reason"
            :rows="3"
            :disabled="submitting"
            @update:model-value="(value) => emit('update:reason', value)"
          />
        </div>

        <p v-if="stepUpUrl" class="pa-dialog__stepup" data-testid="privileged-action-stepup">
          <a :href="stepUpUrl">{{ stepUpLabel || stepUpUrl }}</a>
        </p>

        <p
          v-if="errorMessage"
          class="pa-dialog__error"
          role="alert"
          data-testid="privileged-action-error"
        >
          {{ errorMessage }}
          <span v-if="supportReference" class="pa-dialog__ref" data-testid="privileged-action-ref">
            {{ supportReference }}
          </span>
        </p>

        <div class="pa-dialog__actions">
          <UiButton data-testid="privileged-action-cancel" variant="secondary" @click="onCancel">
            {{ cancelLabel }}
          </UiButton>
          <UiButton
            data-testid="privileged-action-confirm"
            :variant="danger ? 'danger' : 'primary'"
            :disabled="confirmDisabled"
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
.pa-dialog-wrapper {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pa-dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}
.pa-dialog {
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
.pa-dialog__title {
  font: 600 1.125rem/1.2 var(--font-sans);
  letter-spacing: -0.015em;
  color: var(--fg);
}
.pa-dialog__impact {
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.pa-dialog__field {
  display: grid;
  gap: 6px;
}
.pa-dialog__label {
  font: 500 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.pa-dialog__stepup {
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
}
.pa-dialog__error {
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--danger);
}
.pa-dialog__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.pa-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
}
</style>
