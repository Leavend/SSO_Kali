<!-- app/components/ip-access/IpAccessRuleFormDialog.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildCreateRulePayload,
  validateIpAccessForm,
  type IpAccessFormModel,
} from '@/lib/ip-access/ip-access-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type { IpAccessRuleCreatePayload } from '@/types/ip-access.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: IpAccessRuleCreatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): IpAccessFormModel {
  return { cidr: '', mode: 'block', reason: '', expires_at: '' }
}

const form = reactive<IpAccessFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed blank on every (re)open so a previous draft never bleeds into the next.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, blank())
    submitAttempted.value = false
  },
  { immediate: true },
)

// UiSelect models a string; bridge it to the IpAccessMode union.
const modeModel = computed<string>({
  get: () => form.mode,
  set: (value) => {
    form.mode = value === 'allow' ? 'allow' : 'block'
  },
})
const modeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'allow', label: t('ip_access.mode_allow') },
  { value: 'block', label: t('ip_access.mode_block') },
])

const validation = computed(() => validateIpAccessForm(form))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`ip_access.field_${code}`) : undefined
}

const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', buildCreateRulePayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="ip-access-form-dialog"
    :title="t('ip_access.create_title')"
    :description="t('ip_access.create_desc')"
    :close-label="t('common.btn_cancel')"
    @close="emit('cancel')"
  >
    <form class="ip-form" data-testid="ip-access-form" @submit.prevent="onSubmit">
      <UiFormField
        id="ip_cidr"
        :label="t('ip_access.label_cidr')"
        :error="fieldError('cidr')"
        required
      >
        <UiInput
          id="ip_cidr"
          v-model="form.cidr"
          data-testid="ip-access-field-cidr"
          autocomplete="off"
          :placeholder="t('ip_access.cidr_placeholder')"
          :invalid="Boolean(fieldError('cidr'))"
        />
      </UiFormField>

      <UiFormField id="ip_mode" :label="t('ip_access.label_mode')">
        <UiSelect
          id="ip_mode"
          v-model="modeModel"
          :options="modeOptions"
          data-testid="ip-access-field-mode"
        />
      </UiFormField>

      <UiFormField
        id="ip_reason"
        :label="t('ip_access.label_reason')"
        :error="fieldError('reason')"
        required
      >
        <UiInput
          id="ip_reason"
          v-model="form.reason"
          data-testid="ip-access-field-reason"
          autocomplete="off"
          :placeholder="t('ip_access.reason_placeholder')"
          :invalid="Boolean(fieldError('reason'))"
        />
      </UiFormField>

      <UiFormField id="ip_expires" :label="t('ip_access.label_expires_at')">
        <UiInput
          id="ip_expires"
          v-model="form.expires_at"
          type="date"
          data-testid="ip-access-field-expires_at"
          autocomplete="off"
        />
      </UiFormField>

      <p v-if="errorMessage" class="ip-form__error" role="alert" data-testid="ip-access-form-error">
        {{ errorMessage }}
        <span v-if="reference" class="ip-form__ref" data-testid="ip-access-form-ref">{{
          reference
        }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="ip-form__step-up"
        :href="stepUpUrl"
        data-testid="ip-access-form-stepup"
      >
        {{ t('ip_access.step_up_cta') }}
      </a>

      <div class="ip-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('common.btn_cancel') }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="ip-access-form-submit"
        >
          {{ t('common.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.ip-form {
  display: grid;
  gap: 14px;
}
.ip-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.ip-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.ip-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.ip-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
