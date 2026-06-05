<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, type Component } from 'vue'
import { useI18n } from '@/composables/useI18n'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useSessionStore } from '@/stores/session.store'
import { useClientsStore } from '../stores/clients.store'
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
  AlertTriangle
} from 'lucide-vue-next'

const store = useClientsStore()
const session = useSessionStore()
const { t } = useI18n()
const canWriteClients = computed(() => session.hasPermission('admin.clients.write'))
const canManageClientLifecycle = computed(
  () => canWriteClients.value && session.hasPermission('admin.sessions.terminate'),
)
const createForm = reactive({
  client_id: '',
  display_name: '',
  owner_email: '',
  redirect_uri: '',
  backchannel_logout_uri: '',
})
const lifecycleForm = reactive({
  disable_reason: '',
  decommission_confirmation: '',
})
const form = reactive({
  display_name: '',
  owner_email: '',
  redirect_uris: '',
  post_logout_redirect_uris: '',
  backchannel_logout_uri: '',
  allowed_scopes: '',
})
const uriValidationMessages = ref<readonly string[]>([])
const lifecycleMessage = ref<string | null>(null)
const uriValidationMessage = computed(() => uriValidationMessages.value.join(' '))
const knownScopeLabels = new Set(['openid', 'profile', 'email', 'offline_access'])
const scopeParityWarnings = computed(() =>
  (store.selectedClient?.allowed_scopes ?? []).filter((scope) => !knownScopeLabels.has(scope)),
)
const clientColumns = [
  { key: 'name', label: 'Client' },
  { key: 'client_id', label: 'Client ID' },
  { key: 'status', label: 'Status' },
] as const

const searchQuery = ref('')
const filteredClients = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return store.clients
  return store.clients.filter((client) =>
    (client.display_name ?? '').toLowerCase().includes(query) ||
    client.client_id.toLowerCase().includes(query),
  )
})

const clientRows = computed<readonly UiDataListRow[]>(() =>
  filteredClients.value.map((client) => ({
    id: client.client_id,
    name: client.display_name ?? client.client_id,
    client_id: client.client_id,
    status: client.status ?? 'unknown',
  })),
)

// Modal support
const showCreateForm = ref(false)
const createDialogRef = ref<HTMLElement | null>(null)
const successMessage = ref<string | null>(null)
const isSaving = ref(false)

function openCreateForm(): void {
  successMessage.value = null
  store.errorMessage = null
  showCreateForm.value = true
  void nextTick(() => {
    createDialogRef.value?.querySelector<HTMLElement>('input, select, button')?.focus()
  })
}

function closeCreateForm(): void {
  showCreateForm.value = false
  createForm.client_id = ''
  createForm.display_name = ''
  createForm.owner_email = ''
  createForm.redirect_uri = ''
  createForm.backchannel_logout_uri = ''
  uriValidationMessages.value = []
  store.errorMessage = null
}

// Tabs support
type DetailTab = 'overview' | 'uris' | 'scopes' | 'security' | 'lifecycle'
const activeDetailTab = ref<DetailTab>('overview')

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: Component }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: Component }> = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'uris', label: 'URIs & Redirects', icon: Globe },
    { key: 'scopes', label: 'Scopes & Access', icon: Key },
    { key: 'security', label: 'Security & Secrets', icon: ShieldAlert },
  ]
  if (canManageClientLifecycle.value) {
    tabs.push({ key: 'lifecycle', label: 'Lifecycle', icon: Settings })
  }
  return tabs
})

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
  activeDetailTab.value = next.key
  void nextTick(() => {
    document.getElementById(`client-tab-${next.key}`)?.focus()
  })
}

onMounted(() => {
  if (store.status === 'idle') {
    void store.load().then(() => {
      syncFormFromSelected()
    })
    return
  }

  syncFormFromSelected()
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
  lifecycleForm.disable_reason = ''
  lifecycleForm.decommission_confirmation = ''
  lifecycleMessage.value = null
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

async function createClient(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  const redirectUri = createForm.redirect_uri.trim()
  const backchannelLogoutUri = createForm.backchannel_logout_uri.trim()
  uriValidationMessages.value = findUriValidationMessages(
    redirectUri === '' ? [] : [redirectUri],
    [],
    backchannelLogoutUri,
  )

  if (uriValidationMessages.value.length > 0 || !isValidUrl(redirectUri)) return

  isSaving.value = true
  try {
    await store.createClient({
      app_name: createForm.display_name,
      client_id: createForm.client_id,
      environment: 'development',
      client_type: 'public',
      app_base_url: originOf(redirectUri) ?? '',
      callback_path: pathOf(redirectUri),
      logout_path: pathOf(backchannelLogoutUri),
      owner_email: createForm.owner_email,
      provisioning: 'jit',
    })
    if (!store.errorMessage) {
      closeCreateForm()
      syncFormFromSelected()
      successMessage.value = 'Client berhasil dibuat.'
      setTimeout(() => {
        if (successMessage.value === 'Client berhasil dibuat.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
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
  const allowedScopes = linesToValues(form.allowed_scopes)
  isSaving.value = true
  try {
    await store.syncSelectedScopes(allowedScopes)
    if (!store.errorMessage) {
      form.allowed_scopes = allowedScopes.join('\n')
      successMessage.value = 'Scope policy client berhasil disimpan.'
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
      successMessage.value = 'Client secret berhasil dirotasi.'
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
</script>

<template>
  <section class="clients-page" aria-labelledby="clients-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('clients.eyebrow') }}</p>
      <h1 id="clients-title">{{ t('clients.title') }}</h1>
      <p class="page-summary">{{ t('clients.summary') }}</p>
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
      <aside class="clients-list" aria-label="Daftar OAuth clients">
        <UiEmptyState
          v-if="store.clients.length === 0"
          :title="t('clients.empty_title')"
          :description="t('clients.empty_desc')"
        />

        <template v-else>
          <UiFormField id="search-clients" label="Cari client" class="clients-search">
            <div class="clients-search__control">
              <Search :size="16" class="clients-search__icon" aria-hidden="true" />
              <UiInput
                id="search-clients"
                v-model="searchQuery"
                placeholder="Cari berdasarkan nama atau ID..."
                autocomplete="off"
                class="clients-search__input"
              />
              <button
                v-if="searchQuery"
                class="clients-search__clear"
                type="button"
                aria-label="Reset pencarian"
                @click="searchQuery = ''"
              >
                <X :size="14" />
              </button>
            </div>
          </UiFormField>

          <UiDataList
            caption="Daftar OAuth clients"
            :columns="clientColumns"
            :rows="clientRows"
          >
            <template #actions="{ row }">
              <button
                class="ui-action ui-action--secondary"
                :aria-current="row.id === store.selectedClientId ? 'true' : undefined"
                :aria-label="`View ${row.name}`"
                type="button"
                @click="selectClient(row.id)"
              >
                View
              </button>
            </template>
          </UiDataList>
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

      <!-- ─── Create client dialog (accessible, inline modal) ────────────── -->
      <div
        v-if="canWriteClients"
        class="client-modal-overlay"
        :class="{ 'client-modal-overlay--open': showCreateForm }"
        @click.self="closeCreateForm"
      >
        <div
          ref="createDialogRef"
          class="client-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-client-title"
          tabindex="-1"
          @keydown.esc="closeCreateForm"
        >
          <div class="client-modal-header">
            <h3 id="create-client-title">Create OAuth client</h3>
            <button
              class="client-modal-close"
              type="button"
              :aria-label="t('common.btn_cancel')"
              @click="closeCreateForm"
            >
              <X :size="18" />
            </button>
          </div>

          <form
            class="client-form"
            aria-labelledby="create-client-title"
            @submit.prevent="createClient"
          >
            <p v-if="store.errorMessage" class="ui-action-message" role="alert" style="color: var(--destructive); background: color-mix(in srgb, var(--destructive) 8%, transparent); padding: 10px 16px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--destructive) 15%, transparent); margin-bottom: 16px; font-size: 0.88rem; font-weight: 500;">
              {{ store.errorMessage }}
            </p>
            <p v-if="uriValidationMessage" class="ui-action-message" role="alert">
              {{ uriValidationMessage }}
            </p>
            <div class="user-form-grid">
              <UiFormField id="create_client_id" label="Client ID" required>
                <UiInput
                  id="create_client_id"
                  v-model="createForm.client_id"
                  name="client_id"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="create_display_name" label="Display name" required>
                <UiInput
                  id="create_display_name"
                  v-model="createForm.display_name"
                  name="create_display_name"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField id="create_owner_email" label="Owner email" required>
                <UiInput
                  id="create_owner_email"
                  v-model="createForm.owner_email"
                  name="create_owner_email"
                  autocomplete="email"
                />
              </UiFormField>
              <UiFormField id="create_redirect_uri" label="Redirect URI" required>
                <UiInput
                  id="create_redirect_uri"
                  v-model="createForm.redirect_uri"
                  name="create_redirect_uri"
                  autocomplete="url"
                />
              </UiFormField>
              <UiFormField id="create_backchannel_logout_uri" label="Logout URL">
                <UiInput
                  id="create_backchannel_logout_uri"
                  v-model="createForm.backchannel_logout_uri"
                  name="create_backchannel_logout_uri"
                  autocomplete="url"
                />
              </UiFormField>
            </div>
            <div class="client-modal-footer">
              <UiButton variant="secondary" type="button" @click="closeCreateForm">
                Cancel
              </UiButton>
              <UiButton variant="primary" type="submit" :disabled="isSaving">
                {{ isSaving ? 'Membuat...' : 'Create client' }}
              </UiButton>
            </div>
          </form>
        </div>
      </div>

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
          <div class="client-profile-hero__avatar" aria-hidden="true">
            {{ store.selectedClient.display_name ? store.selectedClient.display_name.charAt(0).toUpperCase() : 'C' }}
          </div>
          <div class="client-profile-hero__content">
            <div class="client-profile-hero__header-row">
              <h2>{{ store.selectedClient.display_name ?? store.selectedClient.client_id }}</h2>
              <span class="ui-badge client-profile-hero__status-badge">{{ store.selectedClient.status ?? 'unknown' }}</span>
            </div>
            <p class="client-profile-hero__env">{{ store.selectedClient.environment ?? 'environment unknown' }}</p>
            <p class="client-profile-hero__client-id">{{ store.selectedClient.client_id }}</p>
          </div>
          <div class="client-profile-hero__actions">
            <RouterLink
              class="ui-action ui-action--primary"
              :to="{
                name: 'admin.audit',
                query: { consent: '1', client_id: store.selectedClient.client_id },
              }"
            >
              Consent trail
            </RouterLink>
          </div>
        </header>

        <!-- Tabs Navigation -->
        <nav class="client-detail-tabs" role="tablist" aria-label="Client detail sections">
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
            <component :is="tab.icon" :size="16" />
            {{ tab.label }}
          </button>
        </nav>

        <!-- Cross-tab status (errors + success message stay visible) -->
        <div
          v-if="store.errorMessage || successMessage"
          class="client-detail-status"
          aria-live="polite"
          style="margin-bottom: 20px; width: 100%;"
        >
          <p v-if="store.errorMessage" class="ui-action-message" role="alert" style="color: var(--destructive); background: color-mix(in srgb, var(--destructive) 8%, transparent); padding: 10px 16px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--destructive) 15%, transparent); margin: 0 0 8px 0; font-size: 0.88rem; font-weight: 500;">
            {{ store.errorMessage }}
          </p>
          <p v-if="successMessage" class="ui-action-message" role="status" style="color: #10b981; background: rgba(16, 185, 129, 0.08); padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.15); margin: 0; font-size: 0.88rem; font-weight: 500;">
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
          <dl class="detail-grid" style="margin-bottom: 24px;">
            <div>
              <dt>Type</dt>
              <dd>{{ store.selectedClient.type ?? 'unknown' }}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{{ store.selectedClient.owner_email ?? 'Belum diisi' }}</dd>
            </div>
            <div>
              <dt>Secret rotated</dt>
              <dd>{{ store.selectedClient.secret_rotated_at ?? 'Belum ada evidence' }}</dd>
            </div>
            <div>
              <dt>Secret hash</dt>
              <dd>{{ store.selectedClient.has_secret_hash ? 'Tersimpan' : 'Belum tersedia' }}</dd>
            </div>
          </dl>

          <section v-if="canWriteClients" class="detail-section" aria-labelledby="metadata-title">
            <h3 id="metadata-title">{{ t('clients.metadata_title') }}</h3>
            <form class="client-form" @submit.prevent="saveMetadata">
              <div class="user-form-grid user-form-grid-2">
                <UiFormField id="edit_display_name" label="Display name">
                  <UiInput
                    id="edit_display_name"
                    v-model="form.display_name"
                    name="display_name"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit_owner_email" label="Owner email">
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
                  {{ isSaving ? 'Menyimpan...' : 'Simpan metadata' }}
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
          <div style="display: flex; flex-direction: column; gap: 24px; margin-bottom: 24px;">
            <section class="detail-section" aria-labelledby="redirect-uris-title">
              <h3 id="redirect-uris-title">Redirect URIs</h3>
              <ul v-if="store.selectedClient.redirect_uris.length > 0">
                <li v-for="uri in store.selectedClient.redirect_uris" :key="uri"><code>{{ uri }}</code></li>
              </ul>
              <p v-else class="text-muted">No redirect URIs configured.</p>
            </section>

            <section class="detail-section" aria-labelledby="logout-uris-title">
              <h3 id="logout-uris-title">Post Logout Redirect URIs</h3>
              <ul v-if="(store.selectedClient.post_logout_redirect_uris ?? []).length > 0">
                <li v-for="uri in store.selectedClient.post_logout_redirect_uris ?? []" :key="uri">
                  <code>{{ uri }}</code>
                </li>
              </ul>
              <p v-else class="text-muted">No post-logout redirect URIs configured.</p>
            </section>

            <section class="detail-section" aria-labelledby="backchannel-logout-uri-title">
              <h3 id="backchannel-logout-uri-title">Backchannel logout URI</h3>
              <p>
                <code>{{ store.selectedClient.backchannel_logout_uri ?? 'Belum ada evidence' }}</code>
              </p>
            </section>
          </div>

          <section v-if="canWriteClients" class="detail-section" aria-labelledby="uri-policy-title">
            <h3 id="uri-policy-title">{{ t('clients.uri_policy_title') }}</h3>
            <form class="client-form" data-test="uri-policy-form" @submit.prevent="saveUriPolicy">
              <p v-if="uriValidationMessage" class="ui-action-message" role="alert">
                {{ uriValidationMessage }}
              </p>
              <div class="user-form-grid">
                <UiFormField id="redirect_uris" label="Redirect URIs">
                  <UiTextarea
                    id="redirect_uris"
                    v-model="form.redirect_uris"
                    name="redirect_uris"
                    :rows="4"
                  />
                </UiFormField>
                <UiFormField id="post_logout_redirect_uris" label="Post Logout Redirect URIs">
                  <UiTextarea
                    id="post_logout_redirect_uris"
                    v-model="form.post_logout_redirect_uris"
                    name="post_logout_redirect_uris"
                    :rows="4"
                  />
                </UiFormField>
                <UiFormField id="backchannel_logout_uri" label="Backchannel logout URI">
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
                  {{ isSaving ? 'Menyimpan...' : 'Simpan URI policy' }}
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
          <section class="detail-section" style="margin-bottom: 24px;">
            <h3>Allowed Scopes</h3>
            <div class="scope-badges" v-if="(store.selectedClient.allowed_scopes ?? []).length > 0">
              <span v-for="scope in store.selectedClient.allowed_scopes" :key="scope" class="scope-badge">
                <Key :size="12" />
                {{ scope }}
              </span>
            </div>
            <p v-else class="text-muted">No scopes configured.</p>
          </section>

          <section v-if="canWriteClients" class="detail-section" aria-labelledby="scope-policy-title">
            <h3 id="scope-policy-title">{{ t('clients.scope_policy_title') }}</h3>
            <p v-if="scopeParityWarnings.length > 0" class="ui-action-message" role="status">
              Scope label parity warning: {{ scopeParityWarnings.join(', ') }}
            </p>
            <form class="client-form" data-test="scope-policy-form" @submit.prevent="saveScopePolicy">
              <div class="user-form-grid">
                <UiFormField id="allowed_scopes" label="Allowed scopes">
                  <UiTextarea
                    id="allowed_scopes"
                    v-model="form.allowed_scopes"
                    name="allowed_scopes"
                    :rows="4"
                  />
                </UiFormField>
              </div>
              <div class="user-detail-card__actions">
                <UiButton variant="primary" type="submit" :disabled="isSaving">
                  {{ isSaving ? 'Menyimpan...' : 'Simpan scope policy' }}
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
            <p style="margin-bottom: 16px;">
              Rotasi secret hanya menampilkan plaintext satu kali. Salin lalu hapus dari layar.
            </p>
            <div class="user-detail-card__actions">
              <UiButton variant="danger" type="button" @click="rotateSecret" :disabled="isSaving">
                {{ isSaving ? 'Memproses...' : 'Rotate secret' }}
              </UiButton>
            </div>

            <div v-if="store.rotationSecret" class="secret-reveal" role="status">
              <div class="secret-reveal__header">
                <AlertTriangle :size="16" />
                <strong>Secret baru untuk {{ store.rotationClientId }}</strong>
              </div>
              <p class="secret-reveal__warning">
                Simpan secret ini dengan aman di key vault Anda. Secret ini tidak akan ditampilkan lagi setelah Anda menutup layar atau menekan tombol di bawah.
              </p>
              <div class="secret-reveal__code-wrapper">
                <code>{{ store.rotationSecret }}</code>
              </div>
              <div class="user-detail-card__actions" style="margin-top: 12px;">
                <UiButton
                  variant="secondary"
                  size="sm"
                  data-test="clear-rotation-secret"
                  type="button"
                  @click="store.clearRotationSecret"
                >
                  Hapus secret dari layar
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
            <p style="margin-bottom: 16px;">
              Impact summary: disable blocks new authorization and may revoke active tokens.
              Decommission retires client configuration and clears redirect evidence.
            </p>
            <p v-if="lifecycleMessage" class="ui-action-message" role="alert" style="margin-bottom: 16px;">
              {{ lifecycleMessage }}
            </p>

            <!-- Sub-action 1: Disable client -->
            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">Disable Client</h4>
              <p class="user-detail-card__hint" style="margin-bottom: 8px;">
                Menonaktifkan client akan memblokir request otorisasi baru dan dapat mencabut token aktif.
              </p>
              <UiFormField id="client_disable_reason" label="Disable reason">
                <UiTextarea
                  id="client_disable_reason"
                  v-model="lifecycleForm.disable_reason"
                  name="client_disable_reason"
                  :rows="2"
                  placeholder="Masukkan alasan penonaktifan client..."
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  data-test="disable-client"
                  type="button"
                  @click="disableClient"
                  :disabled="isSaving"
                >
                  {{ isSaving ? 'Memproses...' : 'Disable client' }}
                </UiButton>
              </div>
            </div>

            <!-- Sub-action 2: Decommission client -->
            <div class="user-detail__sub-actions" style="margin-top: 24px;">
              <h4 class="user-detail__sub-actions-title">Decommission Client</h4>
              <p class="user-detail-card__hint" style="margin-bottom: 8px;">
                Tindakan destruktif: menghapus konfigurasi client secara permanen. Tindakan ini tidak dapat dibatalkan.
              </p>
              <UiFormField id="decommission_confirmation" label="Type client ID to decommission">
                <UiInput
                  id="decommission_confirmation"
                  v-model="lifecycleForm.decommission_confirmation"
                  name="decommission_confirmation"
                  autocomplete="off"
                  placeholder="Ketik client ID untuk konfirmasi..."
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  data-test="decommission-client"
                  type="button"
                  @click="decommissionClient"
                  :disabled="isSaving"
                >
                  {{ isSaving ? 'Memproses...' : 'Decommission client' }}
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

    <EvidenceContextPanel
      title="Client evidence"
      :request-id="store.requestId"
      :client-id="store.selectedClient?.client_id ?? store.rotationClientId"
    />
  </section>
</template>
