<script setup lang="ts">
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
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

// Valid when not required, else when the trimmed length sits within [min, max]
// (min collapses to 1 when unset so an empty required reason is rejected).
const reasonValid = computed(() => {
  if (!props.reasonRequired) return true
  const length = props.reason.trim().length
  return length >= (props.reasonMin || 1) && length <= props.reasonMax
})

const confirmDisabled = computed(() => props.submitting || !reasonValid.value)

// Raw correlation id is never rendered — only the redacted REF-XXXXXXXX form.
const supportReference = computed(() => formatSupportReference(props.requestId))

function onCancel(): void {
  emit('cancel')
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => !value && onCancel()">
    <AlertDialogPortal disabled force-mount>
      <AlertDialogOverlay class="pa-dialog__overlay" data-testid="privileged-action-overlay" />
      <AlertDialogContent class="pa-dialog">
        <AlertDialogTitle class="pa-dialog__title">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="pa-dialog__impact" data-testid="privileged-action-impact">
          {{ description }}
        </AlertDialogDescription>

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
          <AlertDialogCancel as-child>
            <UiButton data-testid="privileged-action-cancel" variant="secondary">
              {{ cancelLabel }}
            </UiButton>
          </AlertDialogCancel>
          <!-- Confirm is NOT an AlertDialogAction: this dialog must stay open
               through the async submit to show submitting/error/step-up/REF.
               AlertDialogAction auto-closes (emits update:open → cancel), which
               would tear the dialog down mid-flight. Cancel keeps the primitive
               because cancelling SHOULD dismiss. -->
          <UiButton
            data-testid="privileged-action-confirm"
            :variant="danger ? 'danger' : 'primary'"
            :disabled="confirmDisabled"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </UiButton>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
.pa-dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgb(10 10 10 / 0.4);
}
.pa-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1101;
  display: grid;
  gap: 14px;
  width: min(92vw, 32rem);
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  transform: translate(-50%, -50%);
}
.pa-dialog__title {
  font: 600 1rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.pa-dialog__impact {
  font: 400 0.8125rem/1.5 var(--font-sans);
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
