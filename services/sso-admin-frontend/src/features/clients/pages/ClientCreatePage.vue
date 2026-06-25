<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle, XCircle } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { buildStepUpLoginUrl, triggerStepUpReauth } from '@/lib/stepup/stepup'
import { useToast } from '@/components/ui/useToast'
import { useClientsStore } from '../stores/clients.store'
import {
  initialClientCreateForm,
  type ClientType,
  toClientCreatePayload,
} from '../lib/client-create-form'
import type { ClientCreateResponse } from '../types'

const store = useClientsStore()
const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const adminEnv = getAdminEnvironment()

const form = reactive(initialClientCreateForm())
const isSubmitting = ref(false)
const copyFeedback = ref<string | null>(null)
const selectedScopes = ref<string[]>(['openid', 'profile', 'email'])

const touched = reactive<Record<string, boolean>>({
  clientId: false,
  displayName: false,
  ownerEmail: false,
  redirectUri: false,
  backchannelLogoutUri: false,
  clientType: false,
  category: false,
})
const submitAttempted = ref(false)
const isClientIdEdited = ref(false)
const showStepUpDialog = ref(false)
const stepUpLoginHref = ref(buildStepUpLoginUrl())

// Real-time validations
const isRedirectUriValid = computed(() => {
  const value = form.redirectUri.trim()
  if (!value) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !value.includes('*') && url.search === ''
  } catch {
    return false
  }
})

const isLogoutUriValid = computed(() => {
  const logoutValue = form.backchannelLogoutUri.trim()
  if (!logoutValue) return true
  try {
    const redirectUrl = new URL(form.redirectUri.trim())
    const logoutUrl = new URL(logoutValue)
    return (
      ['http:', 'https:'].includes(logoutUrl.protocol) &&
      !logoutValue.includes('*') &&
      logoutUrl.search === '' &&
      redirectUrl.origin === logoutUrl.origin
    )
  } catch {
    return false
  }
})

const isClientIdValid = computed(() => {
  const value = form.clientId.trim()
  return /^[a-z0-9][a-z0-9-]{2,62}$/u.test(value)
})

const errors = computed(() => {
  const errs: Record<string, string> = {}
  if (!isClientIdValid.value) {
    errs.clientId = 'clients.validation_client_id'
  }
  if (form.displayName.trim() === '') {
    errs.displayName = 'clients.validation_display_name'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(form.ownerEmail.trim())) {
    errs.ownerEmail = 'clients.validation_owner_email'
  }
  if (!isRedirectUriValid.value) {
    errs.redirectUri = 'clients.validation_redirect_uri'
  }
  if (!isLogoutUriValid.value) {
    errs.backchannelLogoutUri = 'clients.validation_logout_uri'
  }
  if (form.clientType === null) {
    errs.clientType = 'clients.validation_client_type'
  }
  if (form.category === null) {
    errs.category = 'clients.validation_category'
  }
  if (!selectedScopes.value.includes('openid')) {
    errs.scopes = 'clients.validation_scopes'
  }
  return errs
})

const categoryOptions = computed(() => [
  { value: '', label: t('clients.category_placeholder') },
  { value: 'publik', label: t('clients.category_public') },
  { value: 'kepegawaian', label: t('clients.category_staff') },
])

const isBackendCallbackHintVisible = computed(() => {
  const redirect = form.redirectUri.trim().toLowerCase()
  if (redirect === '') return false
  return /\/auth(?:\/[^/?#]+)*\/callback(?:$|[?#])/u.test(redirect)
})

const isInvalid = computed(() => Object.keys(errors.value).length > 0)
const hasVisibleErrors = computed(() => {
  return Object.keys(errors.value).some((field) => {
    return touched[field] || submitAttempted.value
  })
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

// Watch display name to generate slug suggest
watch(
  () => form.displayName,
  (name) => {
    if (!isClientIdEdited.value) {
      form.clientId = slugify(name).slice(0, 63)
    }
  },
)

onMounted(async () => {
  await store.loadScopes()
})

async function submit(): Promise<void> {
  submitAttempted.value = true
  if (isInvalid.value || isSubmitting.value) return
  isSubmitting.value = true
  form.scopes = selectedScopes.value.join(' ')

  const response = await store.createClient(toClientCreatePayload(form))
  isSubmitting.value = false

  if (!response) {
    if (store.actionStatus === 'step_up_required') {
      showStepUpDialog.value = true
      stepUpLoginHref.value = buildStepUpLoginUrl('/clients/new')
      return
    }
    toast.pushToast({
      tone: 'error',
      title: 'Gagal membuat OAuth client. Silakan periksa input Anda.',
    })
    return
  }

  handleSuccessfulCreate(response)
}

function cancel(): void {
  router.push({ name: 'admin.clients' })
}

function handleSuccessfulCreate(response: ClientCreateResponse): void {
  const successTitle =
    response.registration.type === 'confidential'
      ? t('clients.create_confidential_success')
      : t('clients.create_public_success')
  const envSnippet = buildEnvSnippet(response)

  store.setCreatedClientIntent({
    clientId: response.registration.client_id,
    type: (response.registration.type === 'confidential' ? 'confidential' : 'public') as ClientType,
    plaintextSecret: response.plaintext_secret,
    envSnippet,
  })

  toast.pushToast({ tone: 'success', title: successTitle })
  router.push({
    name: 'admin.clients',
    query: { created: response.registration.client_id },
  })
}

function buildEnvSnippet(response: ClientCreateResponse): string {
  const issuer = adminEnv.ssoBaseUrl
  const registration = response.registration
  const redirectUri = registration.redirect_uris[0] ?? form.redirectUri.trim()
  const postLogoutRedirectUri =
    registration.post_logout_redirect_uris?.[0] ?? new URL('/', redirectUri).toString()
  const allowedScopes = registration.allowed_scopes?.join(' ') ?? selectedScopes.value.join(' ')

  return [
    `SSO_ISSUER=${issuer}`,
    `SSO_CLIENT_ID=${registration.client_id}`,
    ...(response.plaintext_secret
      ? [`SSO_CLIENT_SECRET=${response.plaintext_secret}`]
      : ['# Public client: tidak ada secret']),
    `SSO_REDIRECT_URI=${redirectUri}`,
    `SSO_POST_LOGOUT_URI=${postLogoutRedirectUri}`,
    `SSO_SCOPES="${allowedScopes}"`,
  ].join('\n')
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    copyFeedback.value = t('clients.copy_success')
    toast.pushToast({ tone: 'success', title: t('clients.copy_success') })
  } catch {
    copyFeedback.value = t('clients.copy_failed')
    toast.pushToast({ tone: 'error', title: t('clients.copy_failed') })
  }
}

function errorFor(field: string): string | undefined {
  if (field in touched && !touched[field] && !submitAttempted.value) {
    return undefined
  }
  const key = errors.value[field]
  return key ? t(key) : undefined
}

function selectClientType(type: ClientType): void {
  form.clientType = type
  touched.clientType = true
}

function selectCategory(value: string): void {
  form.category = value === 'publik' || value === 'kepegawaian' ? value : null
  touched.category = true
}

function toggleScope(scopeName: string): void {
  if (scopeName === 'openid') return
  const idx = selectedScopes.value.indexOf(scopeName)
  if (idx > -1) {
    selectedScopes.value.splice(idx, 1)
  } else {
    selectedScopes.value.push(scopeName)
  }
}

function closeStepUpDialog(): void {
  showStepUpDialog.value = false
}

function confirmStepUpReauth(): void {
  triggerStepUpReauth('/clients/new')
}

function onClientTypeKeydown(event: KeyboardEvent): void {
  if (
    event.key === 'ArrowRight' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowUp'
  ) {
    event.preventDefault()
    const nextType = form.clientType === 'public' ? 'confidential' : 'public'
    selectClientType(nextType)
    nextTick(() => {
      document.getElementById(`client_type_${nextType}`)?.focus()
    })
  }
}

function handleClientIdInput(): void {
  isClientIdEdited.value = true
  touched.clientId = true
}
</script>

<template>
  <FormPageShell
    :parent-label="t('menu.clients')"
    :active-label="t('common.btn_create')"
    :title="t('clients.create_title')"
    :description="t('clients.create_dialog_description')"
    :submit-label="t('clients.btn_create_client')"
    :cancel-label="t('common.btn_cancel')"
    :is-submitting="isSubmitting"
    :is-invalid="hasVisibleErrors"
    @submit="submit"
    @cancel="cancel"
  >
    <div
      v-if="store.errorMessage"
      class="ui-action-message ui-action-message--error mb-6"
      role="alert"
    >
      {{ store.errorMessage }}
    </div>

    <!-- Section 1: Identitas -->
    <FormSection
      :title="t('common.identity')"
      :description="t('clients.create_identity_section_desc')"
    >
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
          placeholder="Aplikasi Selamat Kerja"
          :invalid="Boolean(errorFor('displayName'))"
          @blur="touched.displayName = true"
        />
      </UiFormField>

      <UiFormField
        id="create_client_id"
        :label="t('clients.label_client_id')"
        :error="errorFor('clientId')"
        required
      >
        <div>
          <UiInput
            id="create_client_id"
            v-model="form.clientId"
            name="client_id"
            autocomplete="off"
            placeholder="selamat-kerja-app"
            :invalid="Boolean(errorFor('clientId'))"
            @input="handleClientIdInput"
            @blur="touched.clientId = true"
          />
          <div
            class="mt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
          >
            <span class="text-muted-foreground">
              {{ t('clients.client_id_helper') }}
            </span>
            <div
              v-if="form.clientId && (touched.clientId || submitAttempted)"
              aria-live="polite"
              class="flex items-center gap-1 font-medium"
              :class="isClientIdValid ? 'text-success-700' : 'text-destructive'"
            >
              <CheckCircle v-if="isClientIdValid" class="size-3.5 shrink-0" />
              <XCircle v-else class="size-3.5 shrink-0" />
              <span>
                {{
                  isClientIdValid ? t('clients.client_id_valid') : t('clients.client_id_invalid')
                }}
              </span>
            </div>
          </div>
        </div>
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
          placeholder="owner@company.com"
          :invalid="Boolean(errorFor('ownerEmail'))"
          @blur="touched.ownerEmail = true"
        />
      </UiFormField>
    </FormSection>

    <!-- Section 2: Konfigurasi -->
    <FormSection
      :title="t('common.configuration')"
      :description="t('clients.create_config_section_desc')"
    >
      <!-- Client Type Card Grid -->
      <UiFormField
        id="create_client_type"
        :label="t('clients.label_client_type')"
        :error="errorFor('clientType')"
        required
      >
        <div
          role="radiogroup"
          :aria-label="t('clients.label_client_type')"
          class="grid grid-cols-1 gap-4 mt-2 md:grid-cols-2"
        >
          <button
            id="client_type_public"
            role="radio"
            :aria-checked="form.clientType === 'public'"
            :tabindex="form.clientType === 'public' || form.clientType === null ? 0 : -1"
            type="button"
            class="flex flex-col h-full rounded-xl border bg-card/50 p-4 text-left transition-colors cursor-pointer"
            :class="
              form.clientType === 'public'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            "
            @click="selectClientType('public')"
            @keydown="onClientTypeKeydown"
            @blur="touched.clientType = true"
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span
                class="size-4 rounded-full border flex items-center justify-center shrink-0 transition-colors"
                :class="
                  form.clientType === 'public' ? 'border-primary bg-primary/10' : 'border-border'
                "
              >
                <span v-if="form.clientType === 'public'" class="size-2 rounded-full bg-primary" />
              </span>
              {{ t('clients.type_public') }}
            </span>
            <span class="mt-2 text-xs leading-relaxed text-muted-foreground">
              {{ t('clients.type_public_hint') }}
            </span>
            <div class="mt-auto pt-3">
              <span
                class="inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warning-700 whitespace-nowrap"
              >
                {{ t('clients.type_public_badge') }}
              </span>
            </div>
          </button>

          <button
            id="client_type_confidential"
            role="radio"
            :aria-checked="form.clientType === 'confidential'"
            :tabindex="form.clientType === 'confidential' ? 0 : -1"
            type="button"
            class="flex flex-col h-full rounded-xl border bg-card/50 p-4 text-left transition-colors cursor-pointer"
            :class="
              form.clientType === 'confidential'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            "
            @click="selectClientType('confidential')"
            @keydown="onClientTypeKeydown"
            @blur="touched.clientType = true"
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span
                class="size-4 rounded-full border flex items-center justify-center shrink-0 transition-colors"
                :class="
                  form.clientType === 'confidential'
                    ? 'border-primary bg-primary/10'
                    : 'border-border'
                "
              >
                <span
                  v-if="form.clientType === 'confidential'"
                  class="size-2 rounded-full bg-primary"
                />
              </span>
              {{ t('clients.type_confidential') }}
            </span>
            <span class="mt-2 text-xs leading-relaxed text-muted-foreground">
              {{ t('clients.type_confidential_hint') }}
            </span>
            <div class="mt-auto pt-3">
              <span
                class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary whitespace-nowrap"
              >
                {{ t('clients.type_confidential_badge') }}
              </span>
            </div>
          </button>
        </div>
        <p v-if="isBackendCallbackHintVisible" class="mt-2 text-xs text-primary">
          {{ t('clients.client_type_backend_hint') }}
        </p>
      </UiFormField>

      <UiFormField
        id="create_category"
        :label="t('clients.label_category')"
        :error="errorFor('category')"
        required
      >
        <UiSelect
          :model-value="form.category ?? ''"
          :options="categoryOptions"
          :invalid="Boolean(errorFor('category'))"
          @update:model-value="selectCategory"
          @blur="touched.category = true"
        />
        <p class="text-xs text-muted-foreground mt-1.5">
          {{ t('clients.category_helper') }}
        </p>
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
          autocomplete="off"
          placeholder="https://app.company.com/auth/callback"
          :invalid="Boolean(errorFor('redirectUri'))"
          @blur="touched.redirectUri = true"
        />
        <p class="text-xs text-muted-foreground mt-1.5">
          {{ t('clients.redirect_uri_helper') }}
        </p>
      </UiFormField>

      <!-- Allowed Scopes Checklist -->
      <UiFormField
        id="create_allowed_scopes"
        :label="t('clients.label_allowed_scopes')"
        :error="errorFor('scopes')"
        required
      >
        <div
          class="border border-border rounded-xl p-4 space-y-3 bg-card/20 max-h-60 overflow-y-auto mt-2"
        >
          <label
            v-for="scope in store.scopes"
            :key="scope.name"
            class="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            :class="scope.name === 'openid' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'"
          >
            <div class="relative flex items-center justify-center size-4 mt-1">
              <input
                type="checkbox"
                :value="scope.name"
                :checked="selectedScopes.includes(scope.name)"
                :disabled="scope.name === 'openid'"
                class="peer size-4 rounded border border-border bg-background checked:bg-primary checked:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                @change="toggleScope(scope.name)"
              />
              <svg
                class="absolute size-2.5 text-primary-foreground pointer-events-none hidden peer-checked:block"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="3"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div class="grid gap-0.5">
              <span class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {{ scope.name }}
                <span
                  v-if="scope.name === 'openid'"
                  class="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-normal"
                >
                  {{ t('clients.scope_required') }}
                </span>
              </span>
              <span class="text-xs text-muted-foreground">{{
                scope.description || t('clients.no_description')
              }}</span>
            </div>
          </label>
        </div>
      </UiFormField>
    </FormSection>

    <!-- Section 3: Advanced Options -->
    <FormSection
      :title="t('clients.advanced_settings_title')"
      :description="t('clients.advanced_settings_desc')"
    >
      <UiFormField
        id="create_backchannel_logout_uri"
        :label="t('clients.label_logout_url')"
        :error="errorFor('backchannelLogoutUri')"
      >
        <UiInput
          id="create_backchannel_logout_uri"
          v-model="form.backchannelLogoutUri"
          name="create_backchannel_logout_uri"
          autocomplete="off"
          placeholder="https://app.company.com/auth/logout"
          :invalid="Boolean(errorFor('backchannelLogoutUri'))"
          @blur="touched.backchannelLogoutUri = true"
        />
        <p class="text-xs text-muted-foreground mt-1.5">
          {{ t('clients.logout_url_helper') }}
        </p>
      </UiFormField>
    </FormSection>
  </FormPageShell>

  <UiDialog
    :open="showStepUpDialog"
    title-id="client-create-step-up-dialog"
    :title="t('clients.step_up_title')"
    :description="t('clients.step_up_description')"
    :close-label="t('common.btn_cancel')"
    @close="closeStepUpDialog"
  >
    <div class="space-y-4 p-6">
      <p class="text-sm text-muted-foreground">
        {{ t('clients.step_up_description') }}
      </p>
      <div class="flex items-center justify-end gap-3">
        <UiButton variant="secondary" @click="closeStepUpDialog">
          {{ t('common.btn_cancel') }}
        </UiButton>
        <UiButton data-testid="client-create-step-up-confirm" @click="confirmStepUpReauth">
          {{ t('clients.step_up_action') }}
        </UiButton>
      </div>
      <a :href="stepUpLoginHref" class="sr-only">{{ stepUpLoginHref }}</a>
    </div>
  </UiDialog>
</template>
