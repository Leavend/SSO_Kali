<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/composables/useI18n'
import { useMediaQuery } from '@/composables/useMediaQuery'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import ClientDetailPanel from '../components/ClientDetailPanel.vue'
import { useSessionStore } from '@/stores/session.store'
import { useClientsStore } from '../stores/clients.store'
import { clientsApi } from '../services/clients.api'
import { formatFriendlyClientName } from '@/lib/display-identifiers'
import { Search, X, Plus, HelpCircle, ShieldCheck, AlertTriangle } from 'lucide-vue-next'

import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useToast } from '@/components/ui/useToast'
import type { ClientCreationIntent } from '../types'

const route = useRoute()
const router = useRouter()
const store = useClientsStore()
const session = useSessionStore()
const { t } = useI18n()
const toast = useToast()
const docsBaseUrl = getAdminEnvironment().docsBaseUrl

/**
 * ≤920px collapses the inline master–detail grid: the right pane is presented
 * inside a focus-trapping `UiDetailDrawer` instead. The selected client and its
 * loaded payload are untouched, so switching layout never refetches.
 */
const isCompact = useMediaQuery('(max-width: 920px)')
const isDrawerOpen = computed(() => isCompact.value && store.selectedClient !== null)
const canWriteClients = computed(() => session.hasPermission('admin.clients.write'))
const canManageClientLifecycle = computed(
  () => canWriteClients.value && session.hasPermission('admin.sessions.terminate'),
)
const lifecycleForm = reactive({
  disable_reason: '',
  decommission_confirmation: '',
  delete_confirmation: '',
})
const form = reactive({
  display_name: '',
  owner_email: '',
  redirect_uris: '',
  post_logout_redirect_uris: '',
  backchannel_logout_uri: '',
  allowed_scopes: '',
})
const selectedScopes = ref<string[]>([])
const uriValidationMessages = ref<readonly string[]>([])
const lifecycleMessage = ref<string | null>(null)
const deleteMessage = ref<string | null>(null)
const messageTimers = new Set<number>()
const uriValidationMessage = computed(() => uriValidationMessages.value.join(' '))
const knownScopeLabels = computed(() => new Set(store.scopes.map((s) => s.name)))
const scopeParityWarnings = computed(() =>
  (store.selectedClient?.allowed_scopes ?? []).filter(
    (scope) => !knownScopeLabels.value.has(scope),
  ),
)
const searchQuery = ref('')
const filteredClients = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return store.clients
  return store.clients.filter(
    (client) =>
      (client.display_name ?? '').toLowerCase().includes(query) ||
      client.client_id.toLowerCase().includes(query),
  )
})

function scheduleMessageClear(callback: () => void, delayMs: number): void {
  const timer = window.setTimeout(() => {
    messageTimers.delete(timer)
    callback()
  }, delayMs)
  messageTimers.add(timer)
}

function clearMessageTimers(): void {
  for (const timer of messageTimers) {
    window.clearTimeout(timer)
  }
  messageTimers.clear()
}

function avatarInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

function avatarStyle(name: string): Record<string, string> {
  // Dark-aware avatar palette lives in src/assets/tokens.css (--avatar-1..6 + -2 end).
  const palette = [
    { start: 'var(--avatar-1)', end: 'var(--avatar-1-2)' },
    { start: 'var(--avatar-2)', end: 'var(--avatar-2-2)' },
    { start: 'var(--avatar-3)', end: 'var(--avatar-3-2)' },
    { start: 'var(--avatar-4)', end: 'var(--avatar-4-2)' },
    { start: 'var(--avatar-5)', end: 'var(--avatar-5-2)' },
    { start: 'var(--avatar-6)', end: 'var(--avatar-6-2)' },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = palette[Math.abs(hash) % palette.length] ?? palette[0]!
  return { background: `linear-gradient(135deg, ${color.start}, ${color.end})` }
}

const successMessage = ref<string | null>(null)
const isSaving = ref(false)
const copyFeedback = ref<string | null>(null)

// Reveal-on-create contract state
const showContract = ref(false)
const contractEnvLines = ref<readonly string[]>([])
const contractIssuer = ref<string | null>(null)
const createdClientIntent = ref<ClientCreationIntent | null>(null)
const highlightedClientId = ref<string | null>(null)
const showCreatedClientDialog = ref(false)

function openCreateForm(): void {
  successMessage.value = null
  store.errorMessage = null
  router.push({ name: 'admin.clients.create' })
}

function syncCreatedClientDialog(): void {
  const created = typeof route.query.created === 'string' ? route.query.created : null
  highlightedClientId.value = created
  if (created === null) {
    createdClientIntent.value = null
    showCreatedClientDialog.value = false
    return
  }

  createdClientIntent.value = store.consumeCreatedClientIntent(created)
  if (createdClientIntent.value !== null) {
    store.selectedClientId = created
    syncFormFromSelected()
    showCreatedClientDialog.value = true
  }
}

function closeCreatedClientDialog(): void {
  createdClientIntent.value = null
  showCreatedClientDialog.value = false
  const nextQuery = { ...route.query }
  delete nextQuery.created
  router.replace({ name: 'admin.clients', query: nextQuery })
}

onMounted(() => {
  void store.loadScopes()
  if (store.status === 'idle') {
    void store.load().then(() => {
      syncFormFromSelected()
      syncCreatedClientDialog()
    })
    return
  }

  syncFormFromSelected()
  syncCreatedClientDialog()
})

onUnmounted(() => {
  clearMessageTimers()
})

watch(
  () => route.query.created,
  () => {
    syncCreatedClientDialog()
  },
)

const allAvailableScopes = computed(() => {
  const catalogScopes = [...store.scopes]
  const catalogNames = new Set(catalogScopes.map((s) => s.name))
  const clientScopes = store.selectedClient?.allowed_scopes ?? []
  for (const name of clientScopes) {
    if (!catalogNames.has(name)) {
      catalogScopes.push({
        name,
        description: `Custom client scope: ${name}`,
        claims: [],
        default_allowed: false,
      })
    }
  }
  return catalogScopes
})

function linesToValues(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isValidUrl(value: string): boolean {
  return URL.canParse(value)
}

function originOf(value: string): string | null {
  return isValidUrl(value) ? new URL(value).origin : null
}

function pathOf(value: string): string {
  if (!isValidUrl(value)) return ''

  const url = new URL(value)
  return url.pathname || '/'
}

function syncFormFromSelected(): void {
  form.display_name = store.selectedClient?.display_name ?? ''
  form.owner_email = store.selectedClient?.owner_email ?? ''
  form.redirect_uris = store.selectedClient?.redirect_uris.join('\n') ?? ''
  form.post_logout_redirect_uris = store.selectedClient?.post_logout_redirect_uris?.join('\n') ?? ''
  form.backchannel_logout_uri = store.selectedClient?.backchannel_logout_uri ?? ''
  form.allowed_scopes = store.selectedClient?.allowed_scopes?.join('\n') ?? ''
  selectedScopes.value = [...(store.selectedClient?.allowed_scopes ?? [])]
  lifecycleForm.disable_reason = ''
  lifecycleForm.decommission_confirmation = ''
  lifecycleForm.delete_confirmation = ''
  lifecycleMessage.value = null
  deleteMessage.value = null
}

function findUriValidationMessages(
  redirectUris: readonly string[],
  logoutUris: readonly string[],
  backchannelLogoutUri = '',
): string[] {
  const messages: string[] = []
  const allUris = [...redirectUris, ...logoutUris]

  if (allUris.some((uri) => !isValidUrl(uri))) {
    messages.push('Redirect URI harus URL valid.')
  }

  if (new Set(allUris).size !== allUris.length) {
    messages.push('Redirect URI tidak boleh duplikat.')
  }

  if (backchannelLogoutUri !== '' && !isValidUrl(backchannelLogoutUri)) {
    messages.push('Logout URL harus URL valid.')
    return messages
  }

  const redirectOrigins = redirectUris
    .map((uri) => originOf(uri))
    .filter((origin): origin is string => origin !== null)
  const expectedOrigin = redirectOrigins[0] ?? null
  const logoutOrigins = logoutUris
    .map((uri) => originOf(uri))
    .filter((origin): origin is string => origin !== null)
  const backchannelOrigin = originOf(backchannelLogoutUri)

  if (
    expectedOrigin !== null &&
    (logoutOrigins.some((origin) => origin !== expectedOrigin) ||
      (backchannelOrigin !== null && backchannelOrigin !== expectedOrigin))
  ) {
    messages.push('Logout URL harus memakai origin yang sama dengan Redirect URI.')
  }

  return messages
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copyFeedback.value = t('clients.copy_success')
  } catch {
    // Fallback: execCommand for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
      copyFeedback.value = t('clients.copy_success')
    } catch {
      copyFeedback.value = t('clients.copy_failed')
    } finally {
      document.body.removeChild(textarea)
    }
  }
  scheduleMessageClear(() => {
    if (
      copyFeedback.value === t('clients.copy_success') ||
      copyFeedback.value === t('clients.copy_failed')
    ) {
      copyFeedback.value = null
    }
  }, 2500)
}

function copyAllConfig(): void {
  if (!contractEnvLines.value.length) return
  const text = [contractEnvLines.value.join('\n'), '', `# ${contractIssuer.value ?? ''}`]
    .join('\n')
    .trim()
  void copyToClipboard(text)
}

async function fetchContract(hasSecret: boolean): Promise<void> {
  if (!store.selectedClientId) return
  try {
    const displayName = store.selectedClient?.display_name ?? ''
    const redirectUri = store.selectedClient?.redirect_uris[0] ?? ''
    const response = await clientsApi.contract({
      app_name: displayName,
      client_id: store.selectedClientId,
      environment: 'development',
      client_type: hasSecret ? 'confidential' : 'public',
      app_base_url: originOf(redirectUri) ?? '',
      callback_path: pathOf(redirectUri),
      logout_path: store.selectedClient?.backchannel_logout_uri
        ? pathOf(store.selectedClient.backchannel_logout_uri)
        : '',
      owner_email: store.selectedClient?.owner_email ?? '',
      provisioning: 'jit',
      allowed_scopes: store.selectedClient?.allowed_scopes ?? ['openid', 'profile', 'email'],
      // Read-only contract preview: use the selected client's real category so a
      // kepegawaian client previews accurately. Fall back to public only when the
      // detail payload predates the category field.
      category: store.selectedClient?.category ?? 'publik',
    })
    contractEnvLines.value = response.contract.env ?? []
    contractIssuer.value = response.contract.issuer ?? null
    showContract.value = true
  } catch {
    // Contract is non-critical; silently ignore fetch errors
  }
}

async function selectClient(clientId: string): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  await store.selectClient(clientId)
  syncFormFromSelected()
  // The detail panel resets its own active tab to Ikhtisar when the client swaps.
}

function closeDetailDrawer(): void {
  store.selectedClientId = null
}

async function saveMetadata(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  isSaving.value = true
  try {
    await store.updateSelected({
      display_name: form.display_name,
      owner_email: form.owner_email,
    })
    if (!store.errorMessage) {
      successMessage.value = 'Metadata client berhasil disimpan.'
      toast.pushToast({
        tone: 'success',
        title: 'Metadata Diperbarui',
        description: 'Metadata client berhasil disimpan.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'Metadata client berhasil disimpan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function saveUriPolicy(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  const redirectUris = linesToValues(form.redirect_uris)
  const logoutUris = linesToValues(form.post_logout_redirect_uris)
  const backchannelLogoutUri = form.backchannel_logout_uri.trim()
  uriValidationMessages.value = findUriValidationMessages(
    redirectUris,
    logoutUris,
    backchannelLogoutUri,
  )

  if (uriValidationMessages.value.length > 0) return

  isSaving.value = true
  try {
    await store.updateSelected({
      redirect_uris: redirectUris,
      post_logout_redirect_uris: logoutUris,
      backchannel_logout_uri: backchannelLogoutUri,
    })
    if (!store.errorMessage) {
      syncFormFromSelected()
      successMessage.value = 'URI policy client berhasil disimpan.'
      toast.pushToast({
        tone: 'success',
        title: 'URI Policy Diperbarui',
        description: 'URI policy client berhasil disimpan.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'URI policy client berhasil disimpan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function saveScopePolicy(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  isSaving.value = true
  try {
    await store.syncSelectedScopes(selectedScopes.value)
    if (!store.errorMessage) {
      successMessage.value = 'Scope policy client berhasil disimpan.'
      toast.pushToast({
        tone: 'success',
        title: 'Scope Policy Diperbarui',
        description: 'Scope policy client berhasil disimpan.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'Scope policy client berhasil disimpan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function disableClient(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  const reason = lifecycleForm.disable_reason.trim()
  isSaving.value = true
  try {
    await store.disableSelected({ reason })
    if (!store.errorMessage) {
      lifecycleForm.disable_reason = ''
      successMessage.value = 'Client berhasil dinonaktifkan.'
      toast.pushToast({
        tone: 'success',
        title: 'Client Dinonaktifkan',
        description: 'Client berhasil dinonaktifkan.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'Client berhasil dinonaktifkan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function decommissionClient(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  if (lifecycleForm.decommission_confirmation !== store.selectedClient?.client_id) {
    lifecycleMessage.value = 'Ketik client ID untuk konfirmasi decommission.'
    return
  }

  isSaving.value = true
  try {
    await store.decommissionSelected()
    if (!store.errorMessage) {
      lifecycleForm.decommission_confirmation = ''
      lifecycleMessage.value = null
      successMessage.value = 'Client berhasil didecommission.'
      toast.pushToast({
        tone: 'success',
        title: 'Client Didecommission',
        description: 'Client berhasil didecommission.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'Client berhasil didecommission.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function rotateSecret(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  isSaving.value = true
  try {
    await store.rotateSelectedSecret()
    if (!store.errorMessage) {
      if (store.selectedClient) {
        await fetchContract(true)
      }
      successMessage.value = 'Client secret berhasil dirotasi.'
      toast.pushToast({
        tone: 'success',
        title: 'Secret Dirotasi',
        description: 'Client secret berhasil dirotasi.',
      })
      scheduleMessageClear(() => {
        if (successMessage.value === 'Client secret berhasil dirotasi.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

async function deleteClient(): Promise<void> {
  successMessage.value = null
  deleteMessage.value = null
  if (lifecycleForm.delete_confirmation !== store.selectedClient?.client_id) {
    deleteMessage.value = t('clients.delete_confirmation_error')
    return
  }

  isSaving.value = true
  try {
    await store.deleteSelected()
    if (!store.errorMessage) {
      lifecycleForm.delete_confirmation = ''
      deleteMessage.value = null
      toast.pushToast({
        tone: 'success',
        title: 'Klien Dihapus',
        description: 'Client berhasil dihapus secara permanen.',
      })
    }
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section
    class="clients-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="clients-title"
  >
    <div class="page-heading">
      <p class="eyebrow">{{ t('clients.eyebrow') }}</p>
      <h1 id="clients-title">{{ t('clients.title') }}</h1>
      <p class="page-summary">{{ t('clients.summary') }}</p>
      <a
        v-if="canWriteClients"
        class="onboarding-link"
        :href="docsBaseUrl + '/onboarding'"
        target="_blank"
        rel="noopener noreferrer"
      >
        <HelpCircle :size="14" />
        {{ t('clients.onboarding_guide') }}
      </a>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('clients.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Client Management"
      :title="t('clients.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('clients.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div
      v-else
      class="clients-layout"
      :class="{ 'clients-layout--has-selection': store.selectedClientId !== null }"
    >
      <!-- ─── Master: searchable client list (.tbl) ─────────────────────── -->
      <aside class="clients-list" :aria-label="t('clients.list_aria')">
        <UiEmptyState
          v-if="store.clients.length === 0"
          :title="t('clients.empty_title')"
          :description="t('clients.empty_desc')"
        />

        <template v-else>
          <UiFormField
            id="search-clients"
            :label="t('clients.search_label')"
            class="clients-search"
          >
            <div class="clients-search__control">
              <Search :size="16" class="clients-search__icon" aria-hidden="true" />
              <UiInput
                id="search-clients"
                v-model="searchQuery"
                :placeholder="t('clients.search_placeholder')"
                autocomplete="off"
                class="clients-search__input"
              />
              <button
                v-if="searchQuery"
                class="clients-search__clear"
                type="button"
                :aria-label="t('common.btn_reset')"
                @click="searchQuery = ''"
              >
                <X :size="14" />
              </button>
            </div>
          </UiFormField>

          <div class="tbl-shell clients-master">
            <div class="tbl-scroll">
              <table class="tbl tbl--clickable">
                <caption class="sr-only">
                  {{
                    t('clients.list_aria')
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{{ t('clients.label_display_name') }}</th>
                    <th scope="col">{{ t('common.status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="client in filteredClients"
                    :key="client.client_id"
                    class="client-card-item"
                    :aria-selected="client.client_id === store.selectedClientId"
                    :aria-current="
                      client.client_id === store.selectedClientId ? 'true' : undefined
                    "
                    :class="{
                      'client-master-row--highlight': client.client_id === highlightedClientId,
                    }"
                    tabindex="0"
                    @click="selectClient(client.client_id)"
                    @keydown.enter.prevent="selectClient(client.client_id)"
                    @keydown.space.prevent="selectClient(client.client_id)"
                  >
                    <td :data-label="t('clients.label_display_name')">
                      <span class="tbl__rowname">
                        <span
                          class="tbl__avatar"
                          :style="avatarStyle(client.display_name ?? client.client_id)"
                          aria-hidden="true"
                        >
                          {{ avatarInitial(client.display_name ?? client.client_id) }}
                        </span>
                        <span class="tbl__rowmeta">
                          <span class="tbl__primary">{{
                            client.display_name ?? client.client_id
                          }}</span>
                          <span class="tbl__secondary break-anywhere">{{
                            formatFriendlyClientName(client.client_id)
                          }}</span>
                        </span>
                      </span>
                    </td>
                    <td :data-label="t('common.status')" class="tbl__cell--right">
                      <UiStatusBadge :status="client.status ?? 'active'" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <UiButton
          v-if="canWriteClients"
          class="create-client-toggle clients-list__create"
          @click="openCreateForm"
        >
          <Plus :size="16" />
          {{ t('clients.btn_create_client') }}
        </UiButton>
      </aside>

      <!-- ─── Detail (inline on wide; drawer ≤920px) ────────────────────── -->
      <ClientDetailPanel
        v-if="store.selectedClient && !isCompact"
        v-model:selected-scopes="selectedScopes"
        :client="store.selectedClient"
        :can-write-clients="canWriteClients"
        :can-manage-client-lifecycle="canManageClientLifecycle"
        :form="form"
        :lifecycle-form="lifecycleForm"
        :all-available-scopes="allAvailableScopes"
        :scope-parity-warnings="scopeParityWarnings"
        :uri-validation-message="uriValidationMessage"
        :lifecycle-message="lifecycleMessage"
        :delete-message="deleteMessage"
        :success-message="successMessage"
        :is-saving="isSaving"
        :show-contract="showContract"
        :contract-env-lines="contractEnvLines"
        :docs-base-url="docsBaseUrl"
        @save-metadata="saveMetadata"
        @save-uri-policy="saveUriPolicy"
        @save-scope-policy="saveScopePolicy"
        @rotate-secret="rotateSecret"
        @clear-rotation-secret="store.clearRotationSecret"
        @copy-all-config="copyAllConfig"
        @disable-client="disableClient"
        @decommission-client="decommissionClient"
        @delete-client="deleteClient"
        @copy="copyToClipboard"
      />

      <section
        v-else-if="!store.selectedClient && !isCompact"
        class="client-detail-empty"
        role="status"
      >
        <UiEmptyState
          :title="t('clients.no_client_selected_title')"
          :description="t('clients.no_client_selected_desc')"
        />
      </section>
    </div>

    <!-- ≤920px: the detail pane is presented as a focus-trapping drawer. -->
    <UiDetailDrawer
      v-if="isCompact && store.selectedClient"
      :open="isDrawerOpen"
      title-id="client-detail-drawer"
      :title="store.selectedClient.display_name ?? store.selectedClient.client_id"
      :description="t('clients.detail_tabs_label')"
      :close-label="t('common.close')"
      wide
      @close="closeDetailDrawer"
    >
      <ClientDetailPanel
        v-model:selected-scopes="selectedScopes"
        :client="store.selectedClient"
        :can-write-clients="canWriteClients"
        :can-manage-client-lifecycle="canManageClientLifecycle"
        :form="form"
        :lifecycle-form="lifecycleForm"
        :all-available-scopes="allAvailableScopes"
        :scope-parity-warnings="scopeParityWarnings"
        :uri-validation-message="uriValidationMessage"
        :lifecycle-message="lifecycleMessage"
        :delete-message="deleteMessage"
        :success-message="successMessage"
        :is-saving="isSaving"
        :show-contract="showContract"
        :contract-env-lines="contractEnvLines"
        :docs-base-url="docsBaseUrl"
        @save-metadata="saveMetadata"
        @save-uri-policy="saveUriPolicy"
        @save-scope-policy="saveScopePolicy"
        @rotate-secret="rotateSecret"
        @clear-rotation-secret="store.clearRotationSecret"
        @copy-all-config="copyAllConfig"
        @disable-client="disableClient"
        @decommission-client="decommissionClient"
        @delete-client="deleteClient"
        @copy="copyToClipboard"
      />
    </UiDetailDrawer>

    <!-- Copy feedback toast -->
    <div v-if="copyFeedback" class="copy-toast" role="status" aria-live="polite">
      <ShieldCheck :size="16" />
      {{ copyFeedback }}
    </div>

    <EvidenceContextPanel
      title="Client evidence"
      :request-id="store.requestId"
      :client-id="store.selectedClient?.client_id ?? store.rotationClientId"
    />
  </section>

  <UiDialog
    :open="showCreatedClientDialog && createdClientIntent !== null"
    title-id="created-client-dialog"
    :title="
      createdClientIntent?.type === 'confidential'
        ? t('clients.create_confidential_success')
        : t('clients.create_public_success')
    "
    :description="
      createdClientIntent?.type === 'confidential'
        ? t('clients.create_secret_warning')
        : t('clients.create_public_hint')
    "
    :close-label="t('common.btn_close')"
    wide
    @close="closeCreatedClientDialog"
  >
    <div v-if="createdClientIntent" class="space-y-5 p-6">
      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted-foreground">{{
          t('clients.label_client_id')
        }}</label>
        <div class="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-3">
          <code
            class="flex-1 min-w-0 select-all font-mono text-sm text-foreground break-anywhere"
            >{{ createdClientIntent.clientId }}</code
          >
          <UiButton
            size="sm"
            variant="secondary"
            @click="copyToClipboard(createdClientIntent.clientId)"
          >
            {{ t('common.copy') }}
          </UiButton>
        </div>
      </div>

      <div
        v-if="createdClientIntent.plaintextSecret"
        class="space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
        aria-live="polite"
      >
        <div class="flex items-center gap-2 text-destructive">
          <AlertTriangle :size="16" aria-hidden="true" />
          <span class="text-xs font-bold">{{ t('clients.client_secret_label') }}</span>
        </div>
        <p class="text-[11px] text-muted-foreground">{{ t('clients.create_secret_warning') }}</p>
        <div class="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <code
            class="flex-1 min-w-0 select-all font-mono text-sm text-foreground break-anywhere"
            >{{ createdClientIntent.plaintextSecret }}</code
          >
          <UiButton
            size="sm"
            variant="secondary"
            @click="copyToClipboard(createdClientIntent.plaintextSecret)"
          >
            {{ t('clients.btn_copy_secret') }}
          </UiButton>
        </div>
      </div>

      <div
        v-else
        class="rounded-xl border border-warning-700/20 bg-warning-50 p-4 text-xs text-warning-700 dark:bg-warning-700/10"
      >
        {{ t('clients.create_public_recreate_hint') }}
      </div>

      <div class="space-y-2">
        <h4 class="text-xs font-semibold text-muted-foreground">
          {{ t('clients.config_block_title') }}
        </h4>
        <div
          class="relative max-h-56 overflow-y-auto rounded-xl border border-border bg-muted/70 p-4 font-mono text-xs text-foreground"
        >
          <pre><code class="break-anywhere">{{ createdClientIntent.envSnippet }}</code></pre>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 border-t border-border pt-4">
        <a
          :href="docsBaseUrl + '/onboarding'"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-medium text-primary hover:underline"
        >
          {{ t('clients.onboarding_guide') }}
        </a>
        <div class="flex items-center gap-3">
          <UiButton variant="secondary" @click="copyToClipboard(createdClientIntent.envSnippet)">
            {{ t('clients.btn_copy_all_config') }}
          </UiButton>
          <UiButton data-testid="close-created-client-dialog" @click="closeCreatedClientDialog">
            {{ t('clients.btn_done') }}
          </UiButton>
        </div>
      </div>
    </div>
  </UiDialog>
</template>
