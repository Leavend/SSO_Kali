<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useTabPill } from '@/composables/useTabPill'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import { buttonVariants } from '@/components/ui/button'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useSessionStore } from '@/stores/session.store'
import { useClientsStore } from '../stores/clients.store'
import { clientsApi } from '../services/clients.api'
import { formatFriendlyClientName } from '@/lib/display-identifiers'
import {
  Search,
  X,
  Plus,
  ChevronLeft,
  LayoutDashboard,
  Settings,
  Key,
  ShieldAlert,
  Globe,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  Copy,
  Trash2,
} from 'lucide-vue-next'

import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useToast } from '@/components/ui/useToast'
import type { ClientCreationIntent } from '../types'

const route = useRoute()
const router = useRouter()
const store = useClientsStore()
const session = useSessionStore()
const { t } = useI18n()
const dateFormat = useDateFormat()
const toast = useToast()
const docsBaseUrl = getAdminEnvironment().docsBaseUrl
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

function avatarInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

function avatarStyle(name: string): Record<string, string> {
  const palette = [
    { start: '#6366F1', end: '#4F46E5' },
    { start: '#EC4899', end: '#DB2777' },
    { start: '#10B981', end: '#059669' },
    { start: '#F59E0B', end: '#D97706' },
    { start: '#3B82F6', end: '#2563EB' },
    { start: '#8B5CF6', end: '#7C3AED' },
  ]
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const color = palette[Math.abs(hash) % palette.length] ?? palette[0]!
  return { background: `linear-gradient(135deg, ${color.start}, ${color.end})` }
}

function displayClientType(type: string | null | undefined): string {
  const normalized = type?.trim().toLowerCase()
  if (normalized === 'public') return 'public'
  if (normalized === 'confidential') return 'confidential'
  return t('clients.val_unknown')
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

// Tabs support
type DetailTab = 'overview' | 'uris' | 'scopes' | 'security' | 'lifecycle'
const activeDetailTab = ref<DetailTab>('overview')

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: Component }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: Component }> = [
    { key: 'overview', label: t('clients.tab_overview'), icon: LayoutDashboard },
    { key: 'uris', label: t('clients.tab_uris'), icon: Globe },
    { key: 'scopes', label: t('clients.tab_scopes'), icon: Key },
  ]
  if (canWriteClients.value) {
    tabs.push({ key: 'security', label: t('clients.tab_security'), icon: ShieldAlert })
  }
  if (canManageClientLifecycle.value) {
    tabs.push({ key: 'lifecycle', label: t('clients.tab_lifecycle'), icon: Settings })
  }
  return tabs
})

const tabsContainerRef = ref<HTMLElement | null>(null)
const { pillStyle, updatePillPosition, schedulePillUpdate } = useTabPill({
  containerRef: tabsContainerRef,
  activeSelector: '.client-detail-tab--active',
})

watch(activeDetailTab, () => {
  nextTick(() => {
    updatePillPosition()
  })
})

watch(
  () => store.selectedClientId,
  () => {
    nextTick(() => {
      updatePillPosition()
    })
    schedulePillUpdate()
  }
)

function selectDetailTab(key: DetailTab): void {
  activeDetailTab.value = key
}

function onTabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = detailTabs.value
  let nextIndex = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (index + 1) % tabs.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (index - 1 + tabs.length) % tabs.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = tabs.length - 1
  } else {
    return
  }
  event.preventDefault()
  const next = tabs[nextIndex]
  if (!next) return
  selectDetailTab(next.key)
  void nextTick(() => {
    document.getElementById(`client-tab-${next.key}`)?.focus()
  })
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
  setTimeout(() => {
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
  activeDetailTab.value = 'overview'
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
      setTimeout(() => {
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
      setTimeout(() => {
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
      setTimeout(() => {
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
      setTimeout(() => {
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
      setTimeout(() => {
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
      setTimeout(() => {
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
      <!-- ─── Sidebar: searchable client list ───────────────────────────── -->
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

          <ul class="user-cards-list" role="list">
            <li v-for="client in filteredClients" :key="client.client_id">
              <button
                class="user-card-item client-card-item"
                type="button"
                :class="{
                  'user-card-item--active': client.client_id === store.selectedClientId,
                  'ring-2 ring-success-700/30': client.client_id === highlightedClientId,
                }"
                :aria-current="client.client_id === store.selectedClientId ? 'true' : undefined"
                @click="selectClient(client.client_id)"
              >
                <span
                  class="user-card-item__avatar"
                  :style="avatarStyle(client.display_name ?? client.client_id)"
                  aria-hidden="true"
                >
                  {{ avatarInitial(client.display_name ?? client.client_id) }}
                </span>
                <span class="user-card-item__content">
                  <span class="user-card-item__name-row">
                    <span class="user-card-item__name">
                      {{ client.display_name ?? client.client_id }}
                    </span>
                    <span
                      class="user-card-item__badge"
                      :class="`badge--${client.status ?? 'active'}`"
                    >
                      {{ client.status ?? 'unknown' }}
                    </span>
                  </span>
                  <span class="user-card-item__email stat-value stat-value--truncate">{{
                    client.owner_email ?? formatFriendlyClientName(client.client_id)
                  }}</span>
                  <span class="user-card-item__meta">
                    <span class="user-card-item__role">{{ displayClientType(client.type) }}</span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
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

      <!-- ─── Detail ────────────────────────────────────────────────────── -->
      <article v-if="store.selectedClient" class="client-detail">
        <!-- Mobile back button to list view -->
        <div class="client-detail-back-bar">
          <UiButton variant="secondary" size="sm" @click="store.selectedClientId = null">
            <ChevronLeft :size="16" />
            {{ t('common.back_to_list') }}
          </UiButton>
        </div>

        <!-- Hero -->
        <header class="client-profile-hero">
          <div
            class="client-profile-hero__avatar"
            :style="
              avatarStyle(store.selectedClient.display_name ?? store.selectedClient.client_id)
            "
            aria-hidden="true"
          >
            {{ avatarInitial(store.selectedClient.display_name ?? store.selectedClient.client_id) }}
          </div>
          <div class="client-profile-hero__content">
            <div class="client-profile-hero__header-row">
              <h2 class="break-anywhere">
                {{ store.selectedClient.display_name ?? store.selectedClient.client_id }}
              </h2>
              <span class="ui-badge client-profile-hero__status-badge">{{
                store.selectedClient.status ?? 'unknown'
              }}</span>
            </div>
            <p class="client-profile-hero__env">
              {{ store.selectedClient.environment ?? t('clients.val_unknown') }}
            </p>
            <p class="client-profile-hero__client-id stat-value--with-copy">
              <span class="stat-value stat-value--mono break-anywhere" title="Kode aplikasi">
                {{ formatFriendlyClientName(store.selectedClient.client_id) }}
              </span>
              <button
                class="pill__copy"
                type="button"
                :aria-label="(t('common.copy') || 'Copy') + ' kode aplikasi'"
                :title="t('common.copy') || 'Copy'"
                @click="copyToClipboard(formatFriendlyClientName(store.selectedClient.client_id))"
              >
                <Copy :size="14" />
              </button>
            </p>
          </div>
          <div class="client-profile-hero__actions">
            <RouterLink
              :class="buttonVariants({ variant: 'secondary' })"
              :to="{
                name: 'admin.audit',
                query: { consent: '1', client_id: store.selectedClient.client_id },
              }"
            >
              {{ t('clients.btn_consent_trail') }}
            </RouterLink>
          </div>
        </header>

        <!-- Tabs Navigation -->
        <nav
          ref="tabsContainerRef"
          class="client-detail-tabs scroll-edge-indicator"
          role="tablist"
          :aria-label="t('clients.detail_tabs_label')"
        >
          <div class="client-detail-tabs__pill" :style="pillStyle"></div>
          <button
            v-for="(tab, index) in detailTabs"
            :key="tab.key"
            :id="`client-tab-${tab.key}`"
            class="client-detail-tab"
            :class="{ 'client-detail-tab--active': activeDetailTab === tab.key }"
            role="tab"
            :aria-selected="activeDetailTab === tab.key"
            :aria-controls="`client-panel-${tab.key}`"
            :tabindex="activeDetailTab === tab.key ? 0 : -1"
            type="button"
            @click="selectDetailTab(tab.key)"
            @keydown="onTabKeydown($event, index)"
          >
            <component :is="tab.icon" :size="16" aria-hidden="true" />
            {{ tab.label }}
          </button>
        </nav>

        <!-- Cross-tab status (errors + success message stay visible) -->
        <div
          v-if="store.errorMessage || successMessage"
          class="client-detail-status"
          aria-live="polite"
        >
          <p
            v-if="store.errorMessage"
            class="ui-action-message ui-action-message--error"
            role="alert"
          >
            {{ store.errorMessage }}
          </p>
          <p
            v-if="successMessage"
            class="ui-action-message ui-action-message--success"
            role="status"
          >
            {{ successMessage }}
          </p>
        </div>

        <!-- Tab Panels -->
        <!-- Tab 1: Overview -->
        <div
          v-show="activeDetailTab === 'overview'"
          id="client-panel-overview"
          role="tabpanel"
          aria-labelledby="client-tab-overview"
          class="tab-panel"
        >
          <dl class="detail-grid">
            <div>
              <dt>{{ t('clients.ov_type') }}</dt>
              <dd data-test="client-overview-type">
                {{ displayClientType(store.selectedClient.type) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('clients.ov_owner') }}</dt>
              <dd>{{ store.selectedClient.owner_email ?? t('clients.val_not_set') }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.ov_secret_rotated') }}</dt>
              <dd>{{ dateFormat.smart(store.selectedClient.secret_rotated_at) }}</dd>
            </div>
            <div>
              <dt>{{ t('clients.ov_secret_hash') }}</dt>
              <dd>
                {{
                  store.selectedClient.has_secret_hash
                    ? t('clients.val_stored')
                    : t('clients.val_not_available')
                }}
              </dd>
            </div>
          </dl>

          <section v-if="canWriteClients" class="detail-section" aria-labelledby="metadata-title">
            <h3 id="metadata-title">{{ t('clients.metadata_title') }}</h3>
            <form class="client-form" @submit.prevent="saveMetadata">
              <div class="user-form-grid user-form-grid-2">
                <UiFormField id="edit_display_name" :label="t('clients.label_display_name')">
                  <UiInput
                    id="edit_display_name"
                    v-model="form.display_name"
                    name="display_name"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit_owner_email" :label="t('clients.label_owner_email')">
                  <UiInput
                    id="edit_owner_email"
                    v-model="form.owner_email"
                    name="owner_email"
                    autocomplete="email"
                  />
                </UiFormField>
              </div>
              <div class="user-detail-card__actions">
                <UiButton variant="primary" type="submit" :disabled="isSaving">
                  {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_metadata') }}
                </UiButton>
              </div>
            </form>
          </section>
        </div>

        <!-- Tab 2: URIs & Redirects -->
        <div
          v-show="activeDetailTab === 'uris'"
          id="client-panel-uris"
          role="tabpanel"
          aria-labelledby="client-tab-uris"
          class="tab-panel"
        >
          <section class="detail-section" aria-labelledby="redirect-uris-title">
            <h3 id="redirect-uris-title">{{ t('clients.redirect_uris_title') }}</h3>
            <ul v-if="store.selectedClient.redirect_uris.length > 0">
              <li v-for="uri in store.selectedClient.redirect_uris" :key="uri">
                <code class="client-uri-value break-anywhere">{{ uri }}</code>
              </li>
            </ul>
            <p v-else class="text-muted">{{ t('clients.no_redirect_uris') }}</p>
          </section>

          <section class="detail-section" aria-labelledby="logout-uris-title">
            <h3 id="logout-uris-title">{{ t('clients.logout_uris_title') }}</h3>
            <ul v-if="(store.selectedClient.post_logout_redirect_uris ?? []).length > 0">
              <li v-for="uri in store.selectedClient.post_logout_redirect_uris ?? []" :key="uri">
                <code class="client-uri-value break-anywhere">{{ uri }}</code>
              </li>
            </ul>
            <p v-else class="text-muted">{{ t('clients.no_logout_uris') }}</p>
          </section>

          <section class="detail-section" aria-labelledby="backchannel-logout-uri-title">
            <h3 id="backchannel-logout-uri-title">{{ t('clients.backchannel_uri_title') }}</h3>
            <p>
              <code class="client-uri-value break-anywhere">{{
                store.selectedClient.backchannel_logout_uri ?? t('clients.val_no_evidence')
              }}</code>
            </p>
          </section>

          <section v-if="canWriteClients" class="detail-section" aria-labelledby="uri-policy-title">
            <h3 id="uri-policy-title">{{ t('clients.uri_policy_title') }}</h3>
            <form class="client-form" data-test="uri-policy-form" @submit.prevent="saveUriPolicy">
              <p
                v-if="uriValidationMessage"
                class="ui-action-message ui-action-message--error"
                role="alert"
              >
                {{ uriValidationMessage }}
              </p>
              <div class="user-form-grid">
                <UiFormField id="redirect_uris" :label="t('clients.label_redirect_uris')">
                  <UiTextarea
                    id="redirect_uris"
                    v-model="form.redirect_uris"
                    name="redirect_uris"
                    :rows="4"
                  />
                </UiFormField>
                <UiFormField
                  id="post_logout_redirect_uris"
                  :label="t('clients.label_post_logout_uris')"
                >
                  <UiTextarea
                    id="post_logout_redirect_uris"
                    v-model="form.post_logout_redirect_uris"
                    name="post_logout_redirect_uris"
                    :rows="4"
                  />
                </UiFormField>
                <UiFormField
                  id="backchannel_logout_uri"
                  :label="t('clients.label_backchannel_uri')"
                >
                  <UiInput
                    id="backchannel_logout_uri"
                    v-model="form.backchannel_logout_uri"
                    name="backchannel_logout_uri"
                    autocomplete="url"
                  />
                </UiFormField>
              </div>
              <div class="user-detail-card__actions">
                <UiButton variant="primary" type="submit" :disabled="isSaving">
                  {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_uri_policy') }}
                </UiButton>
              </div>
            </form>
          </section>
        </div>

        <!-- Tab 3: Scopes & Access -->
        <div
          v-show="activeDetailTab === 'scopes'"
          id="client-panel-scopes"
          role="tabpanel"
          aria-labelledby="client-tab-scopes"
          class="tab-panel"
        >
          <section class="detail-section">
            <h3>{{ t('clients.allowed_scopes_title') }}</h3>
            <div v-if="(store.selectedClient.allowed_scopes ?? []).length > 0" class="scope-badges">
              <span
                v-for="scope in store.selectedClient.allowed_scopes"
                :key="scope"
                class="scope-badge"
              >
                <Key :size="12" aria-hidden="true" />
                {{ scope }}
              </span>
            </div>
            <p v-else class="text-muted">{{ t('clients.no_scopes') }}</p>
          </section>

          <section
            v-if="canWriteClients"
            class="detail-section"
            aria-labelledby="scope-policy-title"
          >
            <h3 id="scope-policy-title">{{ t('clients.scope_policy_title') }}</h3>
            <p
              v-if="scopeParityWarnings.length > 0"
              class="ui-action-message ui-action-message--warning"
              role="status"
            >
              {{ t('clients.scope_parity_warning') }} {{ scopeParityWarnings.join(', ') }}
            </p>
            <form
              class="client-form"
              data-test="scope-policy-form"
              @submit.prevent="saveScopePolicy"
            >
              <div class="scope-checkboxes-grid">
                <label
                  v-for="scope in allAvailableScopes"
                  :key="scope.name"
                  :class="[
                    'scope-checkbox-label',
                    selectedScopes.includes(scope.name) ? 'scope-checkbox-label--selected' : '',
                  ]"
                >
                  <input
                    type="checkbox"
                    :value="scope.name"
                    v-model="selectedScopes"
                    :disabled="scope.name === 'openid'"
                    class="scope-checkbox-input"
                  />
                  <div class="scope-checkbox-content">
                    <span class="scope-checkbox-name">
                      {{ scope.name }}
                      <span v-if="scope.name === 'openid'" class="scope-required-tag"
                        >required</span
                      >
                    </span>
                    <p class="scope-checkbox-desc">{{ scope.description }}</p>
                  </div>
                </label>
              </div>
              <div class="user-detail-card__actions" style="margin-top: 20px">
                <UiButton variant="primary" type="submit" :disabled="isSaving">
                  {{ isSaving ? t('clients.btn_saving') : t('clients.btn_save_scope_policy') }}
                </UiButton>
              </div>
            </form>
          </section>
        </div>

        <!-- Tab 4: Security & Secrets -->
        <div
          v-show="activeDetailTab === 'security'"
          id="client-panel-security"
          role="tabpanel"
          aria-labelledby="client-tab-security"
          class="tab-panel"
        >
          <section
            v-if="canWriteClients"
            class="detail-section detail-section--danger"
            aria-labelledby="secret-title"
          >
            <h3 id="secret-title">{{ t('clients.secret_title') }}</h3>
            <p class="detail-section__lead">{{ t('clients.secret_hint') }}</p>
            <div class="user-detail-card__actions">
              <UiButton variant="danger" type="button" :disabled="isSaving" @click="rotateSecret">
                {{ isSaving ? t('clients.btn_processing') : t('clients.btn_rotate_secret') }}
              </UiButton>
            </div>

            <div v-if="store.rotationSecret" class="secret-reveal" role="status">
              <div class="secret-reveal__header">
                <AlertTriangle :size="16" aria-hidden="true" />
                <strong>{{ t('clients.secret_reveal_title') }} {{ store.rotationClientId }}</strong>
              </div>
              <p class="secret-reveal__warning">{{ t('clients.secret_reveal_warning') }}</p>
              <div class="secret-reveal__code-wrapper">
                <code id="revealed-secret" class="secret-code-value break-anywhere">{{
                  store.rotationSecret
                }}</code>
                <button
                  class="secret-reveal__copy-btn"
                  type="button"
                  :aria-label="t('clients.btn_copy_secret')"
                  @click="copyToClipboard(store.rotationSecret!)"
                >
                  <ShieldCheck :size="14" />
                  {{ t('clients.btn_copy_secret') }}
                </button>
              </div>

              <!-- Config contract block -->
              <div v-if="showContract && contractEnvLines.length > 0" class="contract-block">
                <h4 class="contract-block__title">{{ t('clients.config_block_title') }}</h4>
                <pre
                  class="contract-block__pre"
                ><code class="break-anywhere">{{ contractEnvLines.join('\n') }}</code></pre>
                <div class="user-detail-card__actions contract-block__actions">
                  <UiButton variant="secondary" size="sm" type="button" @click="copyAllConfig">
                    <ShieldCheck :size="14" />
                    {{ t('clients.btn_copy_all_config') }}
                  </UiButton>
                </div>
              </div>

              <div class="user-detail-card__actions secret-reveal__actions">
                <UiButton
                  variant="secondary"
                  size="sm"
                  data-test="clear-rotation-secret"
                  type="button"
                  @click="store.clearRotationSecret"
                >
                  {{ t('clients.btn_clear_secret') }}
                </UiButton>
              </div>
            </div>
          </section>
        </div>

        <!-- Tab 5: Lifecycle -->
        <div
          v-show="activeDetailTab === 'lifecycle'"
          id="client-panel-lifecycle"
          role="tabpanel"
          aria-labelledby="client-tab-lifecycle"
          class="tab-panel"
        >
          <section
            v-if="canManageClientLifecycle"
            class="detail-section detail-section--danger"
            aria-labelledby="lifecycle-title"
          >
            <h3 id="lifecycle-title">{{ t('clients.lifecycle_title') }}</h3>
            <p class="detail-section__lead">{{ t('clients.lifecycle_impact') }}</p>
            <p
              v-if="lifecycleMessage"
              class="ui-action-message ui-action-message--error"
              role="alert"
            >
              {{ lifecycleMessage }}
            </p>

            <!-- Sub-action 1: Disable client -->
            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">{{ t('clients.sub_disable_title') }}</h4>
              <p class="user-detail-card__hint">{{ t('clients.disable_hint') }}</p>
              <UiFormField id="client_disable_reason" :label="t('clients.label_disable_reason')">
                <UiTextarea
                  id="client_disable_reason"
                  v-model="lifecycleForm.disable_reason"
                  name="client_disable_reason"
                  :rows="2"
                  :placeholder="t('clients.disable_placeholder')"
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  data-test="disable-client"
                  type="button"
                  :disabled="isSaving"
                  @click="disableClient"
                >
                  {{ isSaving ? t('clients.btn_processing') : t('clients.btn_disable_client') }}
                </UiButton>
              </div>
            </div>

            <!-- Sub-action 2: Decommission client -->
            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">
                {{ t('clients.sub_decommission_title') }}
              </h4>
              <p class="user-detail-card__hint">{{ t('clients.decommission_hint') }}</p>
              <UiFormField
                id="decommission_confirmation"
                :label="`${t('clients.label_decommission')} (${store.selectedClientId})`"
              >
                <UiInput
                  id="decommission_confirmation"
                  v-model="lifecycleForm.decommission_confirmation"
                  name="decommission_confirmation"
                  autocomplete="off"
                  :placeholder="t('clients.decommission_placeholder')"
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  data-test="decommission-client"
                  type="button"
                  :disabled="isSaving"
                  @click="decommissionClient"
                >
                  {{
                    isSaving ? t('clients.btn_processing') : t('clients.btn_decommission_client')
                  }}
                </UiButton>
              </div>
            </div>

            <!-- Sub-action 3: Hard delete client -->
            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title client-delete-title">
                {{ t('clients.sub_delete_title') }}
              </h4>
              <p class="user-detail-card__hint">{{ t('clients.delete_hint') }}</p>
              <p
                v-if="deleteMessage"
                class="ui-action-message ui-action-message--error"
                role="alert"
              >
                {{ deleteMessage }}
              </p>
              <UiFormField
                id="delete_confirmation"
                :label="`${t('clients.label_delete_confirmation')} (${store.selectedClientId})`"
              >
                <UiInput
                  id="delete_confirmation"
                  v-model="lifecycleForm.delete_confirmation"
                  name="delete_confirmation"
                  autocomplete="off"
                  :placeholder="t('clients.delete_placeholder')"
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  data-test="delete-client"
                  type="button"
                  :disabled="isSaving"
                  @click="deleteClient"
                >
                  {{ isSaving ? t('clients.btn_processing') : t('clients.btn_delete_client') }}
                </UiButton>
              </div>
            </div>
          </section>
        </div>
      </article>

      <section v-else class="client-detail-empty" role="status">
        <UiEmptyState
          :title="t('clients.no_client_selected_title')"
          :description="t('clients.no_client_selected_desc')"
        />
      </section>
    </div>

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
