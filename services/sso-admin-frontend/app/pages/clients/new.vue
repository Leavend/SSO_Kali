<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import { useScopeCatalog } from '@/composables/useScopeCatalog'
import { clientsApi } from '@/services/clients.api'
import {
  slugifyClientId,
  isValidClientId,
  parseScopes,
  validateClientCreateForm,
  toClientCreatePayload,
  type ClientCreateForm,
} from '@/lib/clients/client-create-form'
import { buildClientEnvSnippet } from '@/lib/clients/client-secret'
import type { ClientType, CreateClientResponse } from '@/types/clients.types'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import ClientSecretReveal from '@/components/clients/ClientSecretReveal.vue'

definePageMeta({
  name: 'admin.clients.create',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.write'],
})

const { t } = useI18n()
const action = usePrivilegedAction<CreateClientResponse>()
const { scopes: catalogScopes } = useScopeCatalog()

// --- form state -------------------------------------------------------------
const form = ref<ClientCreateForm>({
  display_name: '',
  client_id: '',
  owner_email: '',
  client_type: null,
  category: '',
  redirect_uri: '',
  backchannel_logout_uri: '',
})
const scopesText = ref('')
const isClientIdManual = ref(false)

// openid is always forced into the submitted set.
const selectedScopes = computed<readonly string[]>(() =>
  Array.from(new Set(['openid', ...parseScopes(scopesText.value)])),
)

watch(
  () => form.value.display_name,
  (name) => {
    if (!isClientIdManual.value) form.value.client_id = slugifyClientId(name)
  },
)

// UiSelect speaks `string`; client_type is `ClientType | null`. This writable
// proxy keeps the read side non-null ('' when unset) so the binding type-checks
// while the form model stays null until a real type is chosen (the validator
// gates on `client_type == null`).
const clientTypeModel = computed<string>({
  get: () => form.value.client_type ?? '',
  set: (value) => {
    form.value.client_type = value === '' ? null : (value as ClientType)
  },
})

const clientTypeOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'public', label: t('clients.type_public') },
  { value: 'confidential', label: t('clients.type_confidential') },
])
const categoryOptions = computed<readonly UiSelectOption[]>(() => [
  { value: '', label: t('clients.category_placeholder') },
  { value: 'publik', label: t('clients.category_public') },
  { value: 'kepegawaian', label: t('clients.category_staff') },
])

// --- validation -------------------------------------------------------------
const fieldErrors = computed(() => validateClientCreateForm(form.value, selectedScopes.value))
const serverFieldErrors = computed(() => action.fieldErrors.value)
function serverError(field: string): string | undefined {
  return serverFieldErrors.value[field]?.[0]
}
function fieldError(field: string): string | undefined {
  const key = fieldErrors.value[field]
  return key ? t(key) : serverError(field)
}

const clientIdValid = computed<boolean>(() => isValidClientId(form.value.client_id.trim()))
const isInvalid = computed<boolean>(() => Object.keys(fieldErrors.value).length > 0)

// --- failure surface --------------------------------------------------------
const showFailure = computed<boolean>(() =>
  ['forbidden', 'unauthenticated', 'step_up_required', 'rate_limited', 'error'].includes(
    action.status.value,
  ),
)
const failureTone = computed<'error' | 'forbidden' | 'step_up'>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return 'forbidden'
    case 'unauthenticated':
    case 'step_up_required':
      return 'step_up'
    default:
      return 'error'
  }
})
const failureTitle = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('clients.forbidden_title')
    case 'unauthenticated':
      return t('common.session_expired_title')
    case 'step_up_required':
      return t('clients.step_up_title')
    case 'rate_limited':
      return t('clients.rate_limited_title')
    default:
      return t('clients.create_failed_title')
  }
})
const failureDescription = computed<string>(() => {
  switch (action.status.value) {
    case 'forbidden':
      return t('common.forbidden_desc')
    case 'unauthenticated':
      return t('common.session_expired_desc')
    case 'step_up_required':
      return t('clients.step_up_description')
    case 'rate_limited':
      return t('clients.rate_limited_desc')
    default:
      return t('clients.create_failed_desc')
  }
})

// --- one-time secret (CLIENT-ONLY ref — never useState/Pinia/storage) --------
const revealedSecret = ref<string | null>(null)
const revealedClientId = ref('')
const revealOpen = computed<boolean>(() => revealedSecret.value !== null)
const envSnippet = computed<string>(() =>
  buildClientEnvSnippet({
    clientId: revealedClientId.value,
    secret: revealedSecret.value,
    redirectUri: form.value.redirect_uri.trim(),
    scopes: selectedScopes.value,
  }),
)

// --- submit -----------------------------------------------------------------
async function submit(mode: 'create' | 'stage'): Promise<void> {
  if (isInvalid.value || action.isSubmitting.value) return
  const payload = toClientCreatePayload(form.value, selectedScopes.value)
  const result = await action.run(() =>
    mode === 'stage'
      ? clientsApi.stage(payload).then((r) => ({ registration: r.registration }))
      : clientsApi.create(payload),
  )
  if (!result) return
  if (result.plaintext_secret) {
    revealedClientId.value = result.registration.client_id
    revealedSecret.value = result.plaintext_secret
    return
  }
  await navigateTo({
    name: 'admin.clients.detail',
    params: { clientId: result.registration.client_id },
  })
}

async function onRevealClose(): Promise<void> {
  const clientId = revealedClientId.value
  revealedSecret.value = null // clear the one-time secret
  revealedClientId.value = ''
  await navigateTo({ name: 'admin.clients.detail', params: { clientId } })
}

async function onCancel(): Promise<void> {
  await navigateTo({ name: 'admin.clients' })
}
</script>

<template>
  <FormPageShell
    :parent-label="t('menu.clients')"
    :active-label="t('clients.create_title')"
    :title="t('clients.create_title')"
    :description="t('clients.create_dialog_description')"
    :submit-label="t('clients.btn_create_client')"
    :cancel-label="t('common.btn_cancel')"
    :is-submitting="action.isSubmitting.value"
    :is-invalid="isInvalid"
    @submit="submit('create')"
    @cancel="onCancel"
  >
    <template #footer-right>
      <UiButton
        variant="secondary"
        type="button"
        data-testid="form-stage"
        :disabled="isInvalid || action.isSubmitting.value"
        @click="submit('stage')"
      >
        {{ t('clients.btn_stage') }}
      </UiButton>
      <UiButton
        variant="primary"
        type="button"
        data-testid="form-submit"
        :disabled="isInvalid || action.isSubmitting.value"
        :aria-busy="action.isSubmitting.value ? 'true' : undefined"
        @click="submit('create')"
      >
        {{ t('clients.btn_create_client') }}
      </UiButton>
    </template>

    <UiStatusView
      v-if="showFailure"
      :tone="failureTone"
      :eyebrow="t('menu.clients')"
      :title="failureTitle"
      :description="failureDescription"
      :request-id="action.requestId.value ?? undefined"
      :standalone="false"
    >
      <template v-if="action.stepUpUrl.value" #actions>
        <a class="clients-new__step-up" :href="action.stepUpUrl.value" data-testid="step-up-link">
          {{ t('clients.step_up_action') }}
        </a>
      </template>
    </UiStatusView>

    <FormSection
      :title="t('common.identity')"
      :description="t('clients.create_identity_section_desc')"
    >
      <UiFormField
        id="create_display_name"
        :label="t('clients.label_display_name')"
        :error="fieldError('display_name')"
        required
      >
        <UiInput
          id="create_display_name"
          v-model="form.display_name"
          autocomplete="off"
          :invalid="Boolean(fieldError('display_name'))"
        />
      </UiFormField>

      <UiFormField
        id="create_client_id"
        :label="t('clients.label_client_id')"
        :hint="t('clients.client_id_helper')"
        :error="fieldError('client_id')"
        required
      >
        <div class="clients-new__client-id">
          <UiInput
            id="create_client_id"
            v-model="form.client_id"
            autocomplete="off"
            :invalid="Boolean(fieldError('client_id'))"
            @input="isClientIdManual = true"
          />
          <span
            v-if="form.client_id.trim() && clientIdValid"
            class="clients-new__id-ok"
            data-testid="client-id-valid"
          >
            <Check :size="14" aria-hidden="true" /> {{ t('clients.client_id_valid') }}
          </span>
          <span
            v-else-if="form.client_id.trim()"
            class="clients-new__id-bad"
            data-testid="client-id-invalid"
          >
            <X :size="14" aria-hidden="true" /> {{ t('clients.client_id_invalid') }}
          </span>
        </div>
      </UiFormField>

      <UiFormField
        id="create_owner_email"
        :label="t('clients.label_owner_email')"
        :error="fieldError('owner_email')"
        required
      >
        <UiInput
          id="create_owner_email"
          v-model="form.owner_email"
          type="email"
          autocomplete="off"
          :invalid="Boolean(fieldError('owner_email'))"
        />
      </UiFormField>
    </FormSection>

    <FormSection
      :title="t('clients.metadata_title')"
      :description="t('clients.create_config_section_desc')"
    >
      <UiFormField id="create_client_type" :label="t('clients.label_client_type')" required>
        <UiSelect id="create_client_type" v-model="clientTypeModel" :options="clientTypeOptions" />
      </UiFormField>

      <UiFormField
        id="create_category"
        :label="t('clients.label_category')"
        :hint="t('clients.category_helper')"
        :error="fieldError('category')"
        required
      >
        <UiSelect id="create_category" v-model="form.category" :options="categoryOptions" />
      </UiFormField>

      <UiFormField
        id="create_redirect_uri"
        :label="t('clients.label_redirect_uri')"
        :hint="t('clients.redirect_uri_helper')"
        :error="fieldError('redirect_uri')"
        required
      >
        <UiInput
          id="create_redirect_uri"
          v-model="form.redirect_uri"
          autocomplete="off"
          :invalid="Boolean(fieldError('redirect_uri'))"
        />
      </UiFormField>

      <UiFormField
        id="create_backchannel_uri"
        :label="t('clients.label_backchannel_uri')"
        :hint="t('clients.logout_url_helper')"
        :error="fieldError('backchannel_logout_uri')"
      >
        <UiInput
          id="create_backchannel_uri"
          v-model="form.backchannel_logout_uri"
          autocomplete="off"
          :invalid="Boolean(fieldError('backchannel_logout_uri'))"
        />
      </UiFormField>
    </FormSection>

    <FormSection :title="t('clients.allowed_scopes_title')">
      <UiFormField
        id="create_scopes"
        :label="t('clients.label_allowed_scopes')"
        :hint="t('clients.scopes_hint')"
        :error="fieldError('scopes')"
        required
      >
        <UiInput
          id="create_scopes"
          v-model="scopesText"
          autocomplete="off"
          :invalid="Boolean(fieldError('scopes'))"
        />
      </UiFormField>
      <ul v-if="catalogScopes.length" class="clients-new__catalog" aria-live="polite">
        <li v-for="scope in catalogScopes" :key="scope.name">{{ scope.name }}</li>
      </ul>
    </FormSection>
  </FormPageShell>

  <ClientSecretReveal
    :open="revealOpen"
    :client-id="revealedClientId"
    :secret="revealedSecret"
    :env-snippet="envSnippet"
    :title="t('clients.secret_reveal_title')"
    :description="t('clients.create_secret_warning')"
    :warning="t('clients.secret_reveal_warning')"
    :copy-label="t('clients.btn_copy_secret')"
    :clear-label="t('clients.btn_clear_secret')"
    :close-label="t('clients.btn_done')"
    @close="onRevealClose"
  />
</template>

<style scoped>
.clients-new__client-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.clients-new__id-ok,
.clients-new__id-bad {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: 600 0.75rem/1 var(--font-sans);
  white-space: nowrap;
}
.clients-new__id-ok {
  color: var(--success);
}
.clients-new__id-bad {
  color: var(--danger);
}
.clients-new__catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font: 500 0.6875rem/1 var(--font-mono);
  color: var(--fg-3);
}
.clients-new__step-up {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
}
</style>
