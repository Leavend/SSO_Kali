<script setup lang="ts">
import { computed, nextTick, reactive, ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle, Copy, ArrowLeft, Check, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import FormPageShell from '@/components/form/FormPageShell.vue'
import FormSection from '@/components/form/FormSection.vue'
import { useI18n } from '@/composables/useI18n'
import { useClientsStore } from '../stores/clients.store'
import { useToast } from '@/components/ui/useToast'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import {
  initialClientCreateForm,
  toClientCreatePayload,
} from '../lib/client-create-form'
import type { ClientCreateResponse } from '../types'

const store = useClientsStore()
const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const docsUrl = getAdminEnvironment().docsBaseUrl

const form = reactive(initialClientCreateForm())
const result = ref<ClientCreateResponse | null>(null)
const isSubmitting = ref(false)
const copyFeedback = ref<string | null>(null)
const secretCopyButton = ref<InstanceType<typeof UiButton> | null>(null)

const selectedScopes = ref<string[]>(['openid', 'profile', 'email'])
const isClientIdEdited = ref(false)

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
    return ['http:', 'https:'].includes(logoutUrl.protocol) &&
      !logoutValue.includes('*') &&
      logoutUrl.search === '' &&
      redirectUrl.origin === logoutUrl.origin
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
  if (!selectedScopes.value.includes('openid')) {
    errs.scopes = 'clients.validation_scopes'
  }
  return errs
})

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

// Watch display name to generate slug suggest
watch(() => form.displayName, (name) => {
  if (!isClientIdEdited.value) {
    form.clientId = slugify(name).slice(0, 63)
  }
})

onMounted(async () => {
  await store.loadScopes()
})

async function submit(): Promise<void> {
  if (isInvalid.value || isSubmitting.value) return
  isSubmitting.value = true
  
  // Map selected scopes array to space/newline string for existing payload parser
  form.scopes = selectedScopes.value.join(' ')
  
  const response = await store.createClient(toClientCreatePayload(form))
  isSubmitting.value = false
  
  if (!response) {
    if (store.actionStatus === 'step_up_required') {
      return
    }
    toast.pushToast({ tone: 'error', title: 'Gagal membuat OAuth client. Silakan periksa input Anda.' })
    return
  }

  result.value = response
  const successTitle = response.registration.type === 'confidential'
    ? t('clients.create_confidential_success')
    : t('clients.create_public_success')
  toast.pushToast({ tone: 'success', title: successTitle })
  await nextTick()
  const button = secretCopyButton.value?.$el
  if (button instanceof HTMLButtonElement) button.focus()
}

function cancel(): void {
  router.push({ name: 'admin.clients' })
}

function handleDone(): void {
  router.push({ name: 'admin.clients' })
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

function toggleScope(scopeName: string) {
  if (scopeName === 'openid') return // locked
  const idx = selectedScopes.value.indexOf(scopeName)
  if (idx > -1) {
    selectedScopes.value.splice(idx, 1)
  } else {
    selectedScopes.value.push(scopeName)
  }
}
</script>

<template>
  <FormPageShell
    v-if="!isResultStep"
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
    <div v-if="store.errorMessage" class="ui-action-message ui-action-message--error mb-6" role="alert">
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
            <span v-if="form.clientId" :class="isClientIdValid ? 'text-success-700' : 'text-destructive'">
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
      <UiFormField id="create_client_type" :label="t('clients.label_client_type')" required>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <button
            type="button"
            class="flex flex-col text-left p-4 border rounded-xl transition-all cursor-pointer bg-card/50"
            :class="form.clientType === 'public' ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border hover:border-muted-foreground/30'"
            @click="form.clientType = 'public'"
          >
            <span class="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle v-if="form.clientType === 'public'" :size="16" class="text-primary" />
              {{ t('clients.type_public') }}
            </span>
            <span class="text-xs text-muted-foreground mt-2 leading-relaxed">
              {{ t('clients.type_public_hint') }}
            </span>
          </button>
          
          <button
            type="button"
            class="flex flex-col text-left p-4 border rounded-xl transition-all cursor-pointer bg-card/50"
            :class="form.clientType === 'confidential' ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border hover:border-muted-foreground/30'"
            @click="form.clientType = 'confidential'"
          >
            <span class="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle v-if="form.clientType === 'confidential'" :size="16" class="text-primary" />
              {{ t('clients.type_confidential') }}
            </span>
            <span class="text-xs text-muted-foreground mt-2 leading-relaxed">
              {{ t('clients.type_confidential_hint') }}
            </span>
          </button>
        </div>
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
        <div class="border border-border rounded-xl p-4 space-y-3 bg-card/20 max-h-60 overflow-y-auto mt-2">
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
                <span v-if="scope.name === 'openid'" class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-normal">
                  Wajib
                </span>
              </span>
              <span class="text-[11px] text-muted-foreground">{{ scope.description || 'Tidak ada deskripsi' }}</span>
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

  <!-- Step 2: Credentials & Success Panel -->
  <div v-else class="max-w-2xl mx-auto py-12 px-6" aria-live="polite">
    <div class="bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6">
      <div class="flex items-start gap-4 pb-4 border-b border-border">
        <div class="p-3 bg-success-50 text-success-700 rounded-full dark:bg-success-700/10">
          <CheckCircle :size="28" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-foreground">
            {{ result?.plaintext_secret ? t('clients.create_confidential_success') : t('clients.create_public_success') }}
          </h2>
          <p class="text-xs text-muted-foreground mt-1">
            {{ result?.plaintext_secret ? t('clients.create_secret_warning') : t('clients.create_public_hint') }}
          </p>
        </div>
      </div>

      <!-- Client ID -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted-foreground">{{ t('clients.label_client_id') }}</label>
        <div class="flex items-center gap-2 bg-muted/50 p-3 rounded-xl border border-border">
          <code class="text-sm font-mono text-foreground flex-1 select-all">{{ result?.registration.client_id }}</code>
          <UiButton size="sm" variant="secondary" @click="copy(result?.registration.client_id ?? '')">
            <Copy :size="14" class="mr-1.5" /> {{ t('common.copy') }}
          </UiButton>
        </div>
      </div>

      <!-- Client Secret (Confidential only) -->
      <div v-if="result?.plaintext_secret" class="space-y-2 bg-destructive/5 dark:bg-destructive/10 border border-destructive/20 p-4 rounded-xl">
        <div class="flex items-center gap-2 text-destructive">
          <AlertTriangle :size="16" />
          <span class="text-xs font-bold">{{ t('clients.client_secret_label') }}</span>
        </div>
        <p class="text-[11px] text-muted-foreground">
          Secret ini hanya ditampilkan <strong>satu kali ini saja</strong> demi alasan keamanan. Salin dan simpan di key vault Anda sekarang.
        </p>
        <div class="flex items-center gap-2 bg-card p-3 rounded-lg border border-border mt-2">
          <code class="text-sm font-mono text-foreground flex-1 select-all">{{ result.plaintext_secret }}</code>
          <UiButton
            ref="secretCopyButton"
            size="sm"
            variant="secondary"
            @click="copy(result.plaintext_secret ?? '')"
          >
            <Copy :size="14" class="mr-1.5" /> {{ t('clients.btn_copy_secret') }}
          </UiButton>
        </div>
      </div>

      <!-- Env Snippet -->
      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-muted-foreground">{{ t('clients.config_block_title') }}</h4>
        <div class="relative bg-muted/70 p-4 rounded-xl border border-border font-mono text-xs text-foreground max-h-40 overflow-y-auto">
          <pre><code>{{ envSnippet }}</code></pre>
          <div class="absolute top-2 right-2">
            <UiButton size="sm" variant="secondary" @click="copy(envSnippet)">
              <Copy :size="14" class="mr-1.5" /> {{ t('common.copy') }}
            </UiButton>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-4 border-t border-border">
        <a :href="docsUrl" target="_blank" rel="noreferrer" class="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1">
          {{ t('clients.onboarding_guide') }}
        </a>
        <UiButton data-testid="close-client-create-result" variant="primary" @click="handleDone">
          {{ t('clients.btn_done') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
