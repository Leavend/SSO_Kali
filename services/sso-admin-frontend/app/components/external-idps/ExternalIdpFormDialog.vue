<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateProviderForm,
  type ExternalIdpFormModel,
} from '@/lib/external-idps/external-idps-form'
import { formatSupportReference } from '@/lib/display-identifiers'
import type {
  ExternalIdentityProvider,
  ExternalIdpCreatePayload,
  ExternalIdpUpdatePayload,
} from '@/types/external-idps.types'

const props = withDefaults(
  defineProps<{
    readonly open: boolean
    readonly mode: 'create' | 'edit'
    readonly provider?: ExternalIdentityProvider | null
    readonly submitting?: boolean
    readonly errorMessage?: string | null
    readonly stepUpUrl?: string | null
    readonly requestId?: string | null
  }>(),
  { provider: null, submitting: false, errorMessage: null, stepUpUrl: null, requestId: null },
)

const emit = defineEmits<{
  (event: 'submit', payload: ExternalIdpCreatePayload | ExternalIdpUpdatePayload): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

function blank(): ExternalIdpFormModel {
  return {
    provider_key: '',
    display_name: '',
    issuer: '',
    metadata_url: '',
    client_id: '',
    client_secret: '',
    algorithms: 'RS256',
    scopes: 'openid',
    priority: '100',
    enabled: true,
    is_backup: false,
    tls_validation_enabled: true,
    signature_validation_enabled: true,
  }
}

const form = reactive<ExternalIdpFormModel>(blank())
const submitAttempted = ref(false)

// Re-seed on (re)open. Edit prefills from the provider; client_secret ALWAYS starts
// blank (write-only — never prefilled). provider_key/issuer are immutable in edit.
watch(
  () => [props.open, props.mode, props.provider] as const,
  () => {
    if (!props.open) return
    const next = blank()
    if (props.mode === 'edit' && props.provider) {
      const p = props.provider
      next.provider_key = p.provider_key
      next.display_name = p.display_name
      next.issuer = p.issuer
      next.metadata_url = p.metadata_url
      next.client_id = p.client_id
      next.algorithms = (p.allowed_algorithms ?? []).join(', ')
      next.scopes = (p.scopes ?? []).join(', ')
      next.priority = String(p.priority ?? 100)
      next.enabled = p.enabled ?? true
      next.is_backup = p.is_backup ?? false
      next.tls_validation_enabled = p.tls_validation_enabled ?? true
      next.signature_validation_enabled = p.signature_validation_enabled ?? true
    }
    Object.assign(form, next)
    submitAttempted.value = false
  },
  { immediate: true },
)

const validation = computed(() => validateProviderForm(form, props.mode))

function fieldError(field: string): string | undefined {
  if (!submitAttempted.value) return undefined
  const code = validation.value.fieldErrors[field]
  return code ? t(`external_idps.field_${code}`) : undefined
}

const title = computed(() =>
  props.mode === 'create' ? t('external_idps.create_title') : t('external_idps.edit_title'),
)
const reference = computed(() => (props.requestId ? formatSupportReference(props.requestId) : null))
const canSubmit = computed(() => validation.value.valid && !props.submitting)
const isEdit = computed(() => props.mode === 'edit')

function onSubmit(): void {
  submitAttempted.value = true
  if (!validation.value.valid || props.submitting) return
  emit('submit', isEdit.value ? buildUpdatePayload(form) : buildCreatePayload(form))
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="external-idp-form-dialog"
    :title="title"
    :description="title"
    :close-label="t('external_idps.btn_cancel')"
    wide
    @close="emit('cancel')"
  >
    <form class="idp-form" data-testid="external-idp-form" @submit.prevent="onSubmit">
      <UiFormField
        id="idp_provider_key"
        :label="t('external_idps.form_provider_key')"
        :error="fieldError('provider_key')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_provider_key"
          v-model="form.provider_key"
          data-testid="idp-field-provider_key"
          autocomplete="off"
          :disabled="isEdit"
          :invalid="Boolean(fieldError('provider_key'))"
        />
      </UiFormField>

      <UiFormField
        id="idp_display_name"
        :label="t('external_idps.form_display_name')"
        :error="fieldError('display_name')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_display_name"
          v-model="form.display_name"
          data-testid="idp-field-display_name"
          autocomplete="off"
          :invalid="Boolean(fieldError('display_name'))"
        />
      </UiFormField>

      <UiFormField
        id="idp_issuer"
        :label="t('external_idps.form_issuer')"
        :error="fieldError('issuer')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_issuer"
          v-model="form.issuer"
          data-testid="idp-field-issuer"
          autocomplete="off"
          :disabled="isEdit"
          :invalid="Boolean(fieldError('issuer'))"
        />
      </UiFormField>

      <UiFormField
        id="idp_metadata_url"
        :label="t('external_idps.form_metadata_url')"
        :error="fieldError('metadata_url')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_metadata_url"
          v-model="form.metadata_url"
          data-testid="idp-field-metadata_url"
          autocomplete="off"
          :invalid="Boolean(fieldError('metadata_url'))"
        />
      </UiFormField>

      <UiFormField
        id="idp_client_id"
        :label="t('external_idps.form_client_id')"
        :error="fieldError('client_id')"
        :required="!isEdit"
      >
        <UiInput
          id="idp_client_id"
          v-model="form.client_id"
          data-testid="idp-field-client_id"
          autocomplete="off"
          :invalid="Boolean(fieldError('client_id'))"
        />
      </UiFormField>

      <UiFormField
        id="idp_client_secret"
        :label="t('external_idps.form_client_secret')"
        :hint="isEdit ? t('external_idps.form_client_secret_hint_edit') : undefined"
      >
        <UiInput
          id="idp_client_secret"
          v-model="form.client_secret"
          type="password"
          data-testid="idp-field-client_secret"
          autocomplete="new-password"
        />
      </UiFormField>

      <UiFormField id="idp_algorithms" :label="t('external_idps.form_algorithms')">
        <UiInput
          id="idp_algorithms"
          v-model="form.algorithms"
          data-testid="idp-field-algorithms"
          autocomplete="off"
        />
      </UiFormField>

      <UiFormField id="idp_scopes" :label="t('external_idps.form_scopes')">
        <UiInput
          id="idp_scopes"
          v-model="form.scopes"
          data-testid="idp-field-scopes"
          autocomplete="off"
        />
      </UiFormField>

      <UiFormField id="idp_priority" :label="t('external_idps.form_priority')">
        <UiInput
          id="idp_priority"
          v-model="form.priority"
          type="number"
          data-testid="idp-field-priority"
          autocomplete="off"
        />
      </UiFormField>

      <div class="idp-form__switches">
        <UiSwitch v-model="form.enabled" :label="t('external_idps.form_enabled')" />
        <UiSwitch v-model="form.is_backup" :label="t('external_idps.form_is_backup')" />
        <template v-if="isEdit">
          <UiSwitch v-model="form.tls_validation_enabled" :label="t('external_idps.form_tls')" />
          <UiSwitch
            v-model="form.signature_validation_enabled"
            :label="t('external_idps.form_signature')"
          />
        </template>
      </div>

      <p
        v-if="errorMessage"
        class="idp-form__error"
        role="alert"
        data-testid="external-idp-form-error"
      >
        {{ errorMessage }}
        <span v-if="reference" class="idp-form__ref" data-testid="external-idp-form-ref">{{
          reference
        }}</span>
      </p>

      <a
        v-if="stepUpUrl"
        class="idp-form__step-up"
        :href="stepUpUrl"
        data-testid="external-idp-form-stepup"
      >
        {{ t('external_idps.step_up_cta') }}
      </a>

      <div class="idp-form__actions">
        <UiButton type="button" variant="ghost" size="sm" @click="emit('cancel')">
          {{ t('external_idps.btn_cancel') }}
        </UiButton>
        <UiButton
          type="submit"
          variant="primary"
          size="sm"
          :disabled="!canSubmit"
          data-testid="external-idp-form-submit"
        >
          {{ t('external_idps.btn_save') }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>

<style scoped>
.idp-form {
  display: grid;
  gap: 14px;
}
.idp-form__switches {
  display: grid;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.idp-form__error {
  margin: 0;
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--danger);
}
.idp-form__ref {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--fg-3);
}
.idp-form__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
.idp-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
