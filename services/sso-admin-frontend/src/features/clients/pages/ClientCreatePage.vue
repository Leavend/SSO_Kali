<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
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
  if (!selectedScopes.value.includes('openid')) {
    errs.scopes = 'clients.validation_scopes'
  }
  return errs
})

const isBackendCallbackHintVisible = computed(() => {
  const redirect = form.redirectUri.trim().toLowerCase()
  if (redirect === '') return false
  return /\/auth(?:\/[^/?#]+)*\/callback(?:$|[?#])/u.test(redirect)
})

const isInvalid = computed(() => Object.keys(errors.value).length > 0)

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
  const key = errors.value[field]
  return key ? t(key) : undefined
}

function selectClientType(type: ClientType): void {
  form.clientType = type
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
    :is-invalid="isInvalid"
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
      description="Tentukan nama tampilan dan pengenal unik untuk client OIDC Anda."
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
          :invalid="Boolean(errors.displayName)"
        />
      </UiFormField>

      <UiFormField
        id="create_client_id"
        :label="t('clients.label_client_id')"
        :error="errorFor('clientId')"
        required
      >
        <div class="relative">
          <UiInput
            id="create_client_id"
            v-model="form.clientId"
            name="client_id"
            autocomplete="off"
            placeholder="selamat-kerja-app"
            :invalid="Boolean(errors.clientId)"
            @input="isClientIdEdited = true"
          />
          <div class="mt-1 flex items-center justify-between text-xs">
            <span class="text-muted-foreground">
              Hanya huruf kecil, angka, dan tanda hubung (3-63 karakter).
            </span>
            <span
              v-if="form.clientId"
              :class="isClientIdValid ? 'text-success-700' : 'text-destructive'"
            >
              {{ isClientIdValid ? 'Format valid' : 'Format tidak valid' }}
            </span>
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
          :invalid="Boolean(errors.ownerEmail)"
        />
      </UiFormField>
    </FormSection>

    <!-- Section 2: Konfigurasi -->
    <FormSection
      :title="t('common.configuration')"
      description="Atur tipe aplikasi, integrasi otorisasi redirect, dan scope akses data."
    >
      <!-- Client Type Card Grid -->
      <UiFormField
        id="create_client_type"
        :label="t('clients.label_client_type')"
        :error="errorFor('clientType')"
        required
      >
        <div class="grid grid-cols-1 gap-4 mt-2 md:grid-cols-2">
          <button
            type="button"
            class="flex flex-col h-full rounded-xl border bg-card/50 p-4 text-left transition-all cursor-pointer"
            :class="
              form.clientType === 'public'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            "
            @click="selectClientType('public')"
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle
                v-if="form.clientType === 'public'"
                :size="16"
                class="text-primary shrink-0"
              />
              {{ t('clients.type_public') }}
            </span>
            <span class="mt-2 text-xs leading-relaxed text-muted-foreground">
              {{ t('clients.type_public_hint') }}
            </span>
            <div class="mt-auto pt-3">
              <span class="text-[11px] font-medium text-warning-700 block">
                {{ t('clients.type_public_helper') }}
              </span>
            </div>
          </button>

          <button
            type="button"
            class="flex flex-col h-full rounded-xl border bg-card/50 p-4 text-left transition-all cursor-pointer"
            :class="
              form.clientType === 'confidential'
                ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                : 'border-border hover:border-muted-foreground/30'
            "
            @click="selectClientType('confidential')"
          >
            <span class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CheckCircle
                v-if="form.clientType === 'confidential'"
                :size="16"
                class="text-primary shrink-0"
              />
              {{ t('clients.type_confidential') }}
            </span>
            <span class="mt-2 text-xs leading-relaxed text-muted-foreground">
              {{ t('clients.type_confidential_hint') }}
            </span>
            <div class="mt-auto pt-3">
              <span
                class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary whitespace-nowrap"
              >
                {{ t('clients.type_confidential_recommended') }}
              </span>
            </div>
          </button>
        </div>
        <p v-if="isBackendCallbackHintVisible" class="mt-2 text-xs text-primary">
          {{ t('clients.client_type_backend_hint') }}
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
          :invalid="Boolean(errors.redirectUri)"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Alamat callback exact HTTP/HTTPS. Tidak diperbolehkan wildcard (*) atau query parameters.
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
            class="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
            :class="{ 'opacity-60 cursor-not-allowed': scope.name === 'openid' }"
          >
            <input
              type="checkbox"
              :value="scope.name"
              :checked="selectedScopes.includes(scope.name)"
              :disabled="scope.name === 'openid'"
              class="mt-1 accent-primary rounded border-border"
              @change="toggleScope(scope.name)"
            />
            <div class="grid gap-0.5">
              <span class="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {{ scope.name }}
                <span
                  v-if="scope.name === 'openid'"
                  class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-normal"
                >
                  Wajib
                </span>
              </span>
              <span class="text-[11px] text-muted-foreground">{{
                scope.description || 'Tidak ada deskripsi'
              }}</span>
            </div>
          </label>
        </div>
      </UiFormField>
    </FormSection>

    <!-- Section 3: Advanced Options -->
    <FormSection
      title="Advanced Settings"
      description="Konfigurasi opsional untuk integrasi siklus hidup otentikasi tingkat lanjut."
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
          :invalid="Boolean(errors.backchannelLogoutUri)"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Harus valid dan memakai origin domain yang sama dengan Redirect URI callback.
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
