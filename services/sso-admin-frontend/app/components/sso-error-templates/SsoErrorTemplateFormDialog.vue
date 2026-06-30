<!-- app/components/sso-error-templates/SsoErrorTemplateFormDialog.vue -->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildUpsertPayload,
  templateToFormModel,
  validateSsoErrorTemplateForm,
  type SsoErrorTemplateFormModel,
} from '@/lib/sso-error-templates/sso-error-template-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type {
  SsoErrorTemplate,
  UpsertSsoErrorTemplatePayload,
} from '@/types/sso-error-templates.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly template: SsoErrorTemplate | null
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: UpsertSsoErrorTemplatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): SsoErrorTemplateFormModel {
  return {
    locale: 'id',
    title: '',
    message: '',
    action_label: '',
    action_url: '',
    retry_allowed: false,
    alternative_login_allowed: false,
    is_enabled: true,
  }
}

const form = reactive<SsoErrorTemplateFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed from the selected template on every (re)open so the form reflects the
// row being edited and a previous draft never bleeds into the next. locale is
// carried through (not editable) — it is the row's identity alongside error_code.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, props.template ? templateToFormModel(props.template) : blank())
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() => validateSsoErrorTemplateForm(form))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`sso_templates.field_${code}`) : undefined
}

const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', buildUpsertPayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="sso-template-form-dialog"
    :title="t('sso_templates.edit_title')"
    :description="
      t('sso_templates.edit_desc', {
        code: template?.error_code ?? '—',
        locale: template?.locale ?? '—',
      })
    "
    :close-label="t('common.btn_cancel')"
    @close="emit('cancel')"
  >
    <form class="sso-template-form" data-testid="sso-template-form" @submit.prevent="onSubmit">
      <UiFormField
        id="sso_template_title"
        :label="t('sso_templates.label_title')"
        :error="fieldError('title')"
        required
      >
        <UiInput
          id="sso_template_title"
          v-model="form.title"
          data-testid="sso-template-field-title"
          autocomplete="off"
          :invalid="Boolean(fieldError('title'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_message"
        :label="t('sso_templates.label_message')"
        :error="fieldError('message')"
        required
      >
        <UiTextarea
          id="sso_template_message"
          v-model="form.message"
          data-testid="sso-template-field-message"
          :invalid="Boolean(fieldError('message'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_action_label"
        :label="t('sso_templates.label_action_label')"
        :error="fieldError('action_label')"
        required
      >
        <UiInput
          id="sso_template_action_label"
          v-model="form.action_label"
          data-testid="sso-template-field-action_label"
          autocomplete="off"
          :invalid="Boolean(fieldError('action_label'))"
        />
      </UiFormField>

      <UiFormField
        id="sso_template_action_url"
        :label="t('sso_templates.label_action_url')"
        :hint="t('sso_templates.action_url_hint')"
        :error="fieldError('action_url')"
      >
        <UiInput
          id="sso_template_action_url"
          v-model="form.action_url"
          type="url"
          data-testid="sso-template-field-action_url"
          autocomplete="off"
          :placeholder="t('sso_templates.action_url_placeholder')"
          :invalid="Boolean(fieldError('action_url'))"
        />
      </UiFormField>

      <div class="sso-template-form__switches">
        <UiSwitch
          :model-value="form.retry_allowed"
          :label="t('sso_templates.label_retry_allowed')"
          @update:model-value="(value) => (form.retry_allowed = value)"
        />
        <UiSwitch
          :model-value="form.alternative_login_allowed"
          :label="t('sso_templates.label_alternative_login_allowed')"
          @update:model-value="(value) => (form.alternative_login_allowed = value)"
        />
        <UiSwitch
          :model-value="form.is_enabled"
          :label="t('sso_templates.label_is_enabled')"
          @update:model-value="(value) => (form.is_enabled = value)"
        />
      </div>

      <p
        v-if="errorMessage"
        class="sso-template-form__error"
        role="alert"
        data-testid="sso-template-form-error"
      >
        {{ errorMessage }}
        <span v-if="reference" class="sso-template-form__ref" data-testid="sso-template-form-ref">{{
          reference
        }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="sso-template-form__step-up"
        :href="stepUpUrl"
        data-testid="sso-template-form-stepup"
      >
        {{ t('sso_templates.step_up_cta') }}
      </a>

      <div class="sso-template-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('common.btn_cancel') }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="sso-template-form-submit"
        >
          {{ t('common.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.sso-template-form {
  display: grid;
  gap: 14px;
}
.sso-template-form__switches {
  display: grid;
  gap: 10px;
}
.sso-template-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.sso-template-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.sso-template-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.sso-template-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
