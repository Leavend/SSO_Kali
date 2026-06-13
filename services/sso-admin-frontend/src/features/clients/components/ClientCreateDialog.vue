<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { AlertTriangle, CheckCircle, Copy } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useI18n } from '@/composables/useI18n'
import { useClientsStore } from '../stores/clients.store'
import {
  initialClientCreateForm,
  toClientCreatePayload,
  validateClientCreateForm,
} from '../lib/client-create-form'
import type { AdminClient, ClientCreateResponse } from '../types'
import type { ClientCreateForm } from '../lib/client-create-form'

interface Props {
  readonly open: boolean
  readonly docsUrl: string
}

interface Emits {
  (event: 'close'): void
  (event: 'created', client: AdminClient): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const store = useClientsStore()
const { t } = useI18n()
const form = reactive(initialClientCreateForm())
const result = ref<ClientCreateResponse | null>(null)
const isSubmitting = ref(false)
const copyFeedback = ref<string | null>(null)
const secretCopyButton = ref<InstanceType<typeof UiButton> | null>(null)
const errors = computed(() => validateClientCreateForm(form))
const isInvalid = computed(() => Object.keys(errors.value).length > 0)
const isResultStep = computed(() => result.value !== null)
const envSnippet = computed(() => {
  if (!result.value) return ''
  const lines = [
    `SSO_CLIENT_ID=${result.value.registration.client_id}`,
    ...(result.value.plaintext_secret
      ? [`SSO_CLIENT_SECRET=${result.value.plaintext_secret}`]
      : []),
    `SSO_REDIRECT_URI=${form.redirectUri.trim()}`,
  ]
  return lines.join('\n')
})

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

async function submit(): Promise<void> {
  if (isInvalid.value || isSubmitting.value) return
  isSubmitting.value = true
  const response = await store.createClient(toClientCreatePayload(form))
  isSubmitting.value = false
  if (!response) return

  result.value = response
  emit('created', response.registration)
  await nextTick()
  const button = secretCopyButton.value?.$el
  if (button instanceof HTMLButtonElement) button.focus()
}

function close(): void {
  reset()
  emit('close')
}

function reset(): void {
  Object.assign(form, initialClientCreateForm())
  result.value = null
  copyFeedback.value = null
  isSubmitting.value = false
  store.errorMessage = null
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    copyFeedback.value = t('clients.copy_success')
  } catch {
    copyFeedback.value = t('clients.copy_failed')
  }
}

function errorFor(field: keyof ClientCreateForm): string | undefined {
  const key = errors.value[field]
  return key ? t(key) : undefined
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="create-client-title"
    :title="t('clients.create_title')"
    :description="t('clients.create_dialog_description')"
    :close-label="t('common.btn_cancel')"
    wide
    @close="close"
  >
    <form
      v-if="!isResultStep"
      class="client-form"
      data-testid="create-client-form"
      :aria-label="t('clients.create_title')"
      @submit.prevent="submit"
    >
      <div class="client-modal-body">
        <div class="create-step-indicator" aria-label="1 / 2">
          <strong>{{ t('clients.create_step_identity') }}</strong>
          <span>{{ t('clients.create_step_result') }}</span>
        </div>
        <p
          v-if="store.errorMessage"
          class="ui-action-message ui-action-message--error"
          role="alert"
        >
          {{ store.errorMessage }}
        </p>
        <div class="user-modal-group">
          <h4 class="user-modal-group-title">{{ t('common.identity') }}</h4>
          <UiFormField
            id="create_client_id"
            :label="t('clients.label_client_id')"
            :error="errorFor('clientId')"
            required
          >
            <UiInput
              id="create_client_id"
              v-model="form.clientId"
              name="client_id"
              autocomplete="off"
              :invalid="Boolean(errors.clientId)"
              aria-describedby="create_client_id-error"
            />
          </UiFormField>
          <UiFormField
            id="create_display_name"
            :label="t('clients.label_display_name')"
            :error="errorFor('displayName')"
            required
          >
            <UiInput
              id="create_display_name"
              v-model="form.displayName"
              name="create_display_name"
              autocomplete="off"
              :invalid="Boolean(errors.displayName)"
              aria-describedby="create_display_name-error"
            />
          </UiFormField>
          <UiFormField
            id="create_owner_email"
            :label="t('clients.label_owner_email')"
            :error="errorFor('ownerEmail')"
            required
          >
            <UiInput
              id="create_owner_email"
              v-model="form.ownerEmail"
              name="create_owner_email"
              type="email"
              autocomplete="email"
              :invalid="Boolean(errors.ownerEmail)"
              aria-describedby="create_owner_email-error"
            />
          </UiFormField>
        </div>
        <div class="user-modal-group">
          <h4 class="user-modal-group-title">{{ t('common.configuration') }}</h4>
          <UiFormField
            id="create_client_type"
            :label="t('clients.label_client_type')"
            :hint="t(`clients.type_${form.clientType}_hint`)"
            required
          >
            <UiSelect
              id="create_client_type"
              v-model="form.clientType"
              name="client_type"
              :options="[
                { value: 'public', label: t('clients.type_public') },
                { value: 'confidential', label: t('clients.type_confidential') },
              ]"
            />
          </UiFormField>
          <UiFormField
            id="create_redirect_uri"
            :label="t('clients.label_redirect_uri')"
            :error="errorFor('redirectUri')"
            required
          >
            <UiInput
              id="create_redirect_uri"
              v-model="form.redirectUri"
              name="create_redirect_uri"
              autocomplete="url"
              :invalid="Boolean(errors.redirectUri)"
              aria-describedby="create_redirect_uri-error"
            />
          </UiFormField>
          <UiFormField
            id="create_backchannel_logout_uri"
            :label="t('clients.label_logout_url')"
            :error="errorFor('backchannelLogoutUri')"
          >
            <UiInput
              id="create_backchannel_logout_uri"
              v-model="form.backchannelLogoutUri"
              name="create_backchannel_logout_uri"
              autocomplete="url"
              :invalid="Boolean(errors.backchannelLogoutUri)"
              aria-describedby="create_backchannel_logout_uri-error"
            />
          </UiFormField>
          <UiFormField
            id="create_allowed_scopes"
            :label="t('clients.label_allowed_scopes')"
            :hint="t('clients.scopes_hint')"
            :error="errorFor('scopes')"
            required
          >
            <UiTextarea
              id="create_allowed_scopes"
              v-model="form.scopes"
              name="create_allowed_scopes"
              :rows="3"
              :invalid="Boolean(errors.scopes)"
              aria-describedby="create_allowed_scopes-error"
            />
          </UiFormField>
        </div>
      </div>
      <div class="client-modal-footer">
        <UiButton variant="secondary" type="button" @click="close">{{
          t('common.btn_cancel')
        }}</UiButton>
        <UiButton
          data-testid="create-client-submit"
          type="submit"
          :disabled="isInvalid || isSubmitting"
        >
          {{ isSubmitting ? t('clients.btn_creating') : t('clients.btn_create_client') }}
        </UiButton>
      </div>
    </form>

    <div v-else class="client-create-result" aria-live="polite">
      <div class="create-step-indicator" aria-label="2 / 2">
        <span>{{ t('clients.create_step_identity') }}</span>
        <strong>{{ t('clients.create_step_result') }}</strong>
      </div>
      <div class="client-create-result__heading">
        <CheckCircle :size="24" aria-hidden="true" />
        <div>
          <h4>
            {{
              result?.plaintext_secret
                ? t('clients.create_confidential_success')
                : t('clients.create_public_success')
            }}
          </h4>
          <p>
            {{
              result?.plaintext_secret
                ? t('clients.create_secret_warning')
                : t('clients.create_public_hint')
            }}
          </p>
        </div>
      </div>
      <div class="credential-field">
        <span>{{ t('clients.label_client_id') }}</span>
        <code>{{ result?.registration.client_id }}</code>
        <UiButton size="sm" variant="secondary" @click="copy(result?.registration.client_id ?? '')"
          ><Copy :size="14" />{{ t('common.copy') }}</UiButton
        >
      </div>
      <div v-if="result?.plaintext_secret" class="credential-field credential-field--secret">
        <span><AlertTriangle :size="14" />{{ t('clients.client_secret_label') }}</span>
        <code>{{ result.plaintext_secret }}</code>
        <UiButton
          ref="secretCopyButton"
          size="sm"
          variant="secondary"
          @click="copy(result.plaintext_secret ?? '')"
          ><Copy :size="14" />{{ t('clients.btn_copy_secret') }}</UiButton
        >
      </div>
      <div class="contract-block">
        <h4 class="contract-block__title">{{ t('clients.config_block_title') }}</h4>
        <pre class="contract-block__pre"><code>{{ envSnippet }}</code></pre>
        <UiButton size="sm" variant="secondary" @click="copy(envSnippet)"
          ><Copy :size="14" />{{ t('clients.btn_copy_all_config') }}</UiButton
        >
      </div>
      <p v-if="copyFeedback" class="ui-action-message" role="status">{{ copyFeedback }}</p>
      <div class="client-modal-footer">
        <a class="ui-link" :href="docsUrl" target="_blank" rel="noreferrer">{{
          t('clients.onboarding_guide')
        }}</a>
        <UiButton data-testid="close-client-create-result" @click="close">{{
          t('clients.btn_done')
        }}</UiButton>
      </div>
    </div>
  </UiDialog>
</template>
