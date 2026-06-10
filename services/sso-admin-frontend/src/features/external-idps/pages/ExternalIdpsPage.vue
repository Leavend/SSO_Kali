<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useSessionStore } from '@/stores/session.store'
import { useExternalIdpsStore } from '../stores/external-idps.store'
import type { ExternalIdpCreatePayload, ExternalIdpUpdatePayload } from '../types'
import {
  ChevronLeft,
  Key,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-vue-next'

const store = useExternalIdpsStore()
const session = useSessionStore()
const { t } = useI18n()
const dateFormat = useDateFormat()

const canWriteExternalIdps = computed(() => session.hasPermission('admin.external-idps.write'))
const canDeleteExternalIdps = computed(
  () => canWriteExternalIdps.value && session.hasPermission('admin.sessions.terminate'),
)

const successMessage = ref<string | null>(null)
const isSaving = ref(false)

// ─── Tabs Navigation ──────────────────────────────────────────────────────────
type DetailTab = 'overview' | 'config' | 'mapping' | 'lifecycle'
const activeDetailTab = ref<DetailTab>('overview')

const detailTabs = computed<Array<{ key: DetailTab; label: string; icon: any }>>(() => {
  const tabs: Array<{ key: DetailTab; label: string; icon: any }> = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  ]
  if (canWriteExternalIdps.value) {
    tabs.push({ key: 'config', label: 'Configuration', icon: Settings })
    tabs.push({ key: 'mapping', label: 'Mapping & Rules', icon: Key })
  }
  if (canDeleteExternalIdps.value) {
    tabs.push({ key: 'lifecycle', label: 'Lifecycle', icon: ShieldAlert })
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
    document.getElementById(`idp-tab-${next.key}`)?.focus()
  })
}

// ─── Search Sidebar ───────────────────────────────────────────────────────────
const searchQuery = ref('')
const filteredProviders = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return store.providers
  return store.providers.filter(
    (p) =>
      p.display_name.toLowerCase().includes(query) ||
      p.provider_key.toLowerCase().includes(query) ||
      p.issuer.toLowerCase().includes(query),
  )
})

// ─── Mapping preview ──────────────────────────────────────────────────────────
const mappingClaims = ref('{"sub":"ext-user-123","email":"user@example.com"}')

async function previewMapping(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(mappingClaims.value) as Record<string, unknown>
  } catch (e) {
    store.errorMessage = 'JSON mapping claims tidak valid.'
    return
  }

  isSaving.value = true
  try {
    await store.previewSelectedMapping(parsed)
    if (store.actionStatus === 'success') {
      successMessage.value = 'Preview mapping berhasil dijalankan.'
      setTimeout(() => {
        if (successMessage.value === 'Preview mapping berhasil dijalankan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

// ─── Create form ──────────────────────────────────────────────────────────────
const showCreateForm = ref(false)
const createProviderKey = ref('')
const createDisplayName = ref('')
const createIssuer = ref('')
const createMetadataUrl = ref('')
const createClientId = ref('')
const createClientSecret = ref('')
const createAlgorithms = ref('RS256')
const createScopes = ref('openid')
const createPriority = ref(100)
const createEnabled = ref(true)
const createIsBackup = ref(false)
const createDialogRef = ref<HTMLElement | null>(null)

function resetCreateForm(): void {
  createProviderKey.value = ''
  createDisplayName.value = ''
  createIssuer.value = ''
  createMetadataUrl.value = ''
  createClientId.value = ''
  createClientSecret.value = ''
  createAlgorithms.value = 'RS256'
  createScopes.value = 'openid'
  createPriority.value = 100
  createEnabled.value = true
  createIsBackup.value = false
  store.actionStatus = 'idle'
  store.errorMessage = null
}

function openCreateForm(): void {
  successMessage.value = null
  store.errorMessage = null
  showCreateForm.value = true
  void nextTick(() => {
    createDialogRef.value?.focus()
  })
}

function closeCreateForm(): void {
  showCreateForm.value = false
  resetCreateForm()
  store.errorMessage = null
}

async function submitCreateProvider(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null

  if (
    !createProviderKey.value.trim() ||
    !createDisplayName.value.trim() ||
    !createIssuer.value.trim() ||
    !createMetadataUrl.value.trim() ||
    !createClientId.value.trim()
  ) {
    store.errorMessage = 'Semua field wajib diisi.'
    store.actionStatus = 'error'
    return
  }

  const payload: ExternalIdpCreatePayload = {
    provider_key: createProviderKey.value.trim(),
    display_name: createDisplayName.value.trim(),
    issuer: createIssuer.value.trim(),
    metadata_url: createMetadataUrl.value.trim(),
    client_id: createClientId.value.trim(),
    ...(createClientSecret.value.trim() && { client_secret: createClientSecret.value.trim() }),
    allowed_algorithms: createAlgorithms.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    scopes: createScopes.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    priority: createPriority.value,
    enabled: createEnabled.value,
    is_backup: createIsBackup.value,
  }

  isSaving.value = true
  try {
    await store.createProvider(payload)
    if (store.actionStatus === 'success') {
      closeCreateForm()
      successMessage.value = 'External IDP provider berhasil dibuat.'
      setTimeout(() => {
        if (successMessage.value === 'External IDP provider berhasil dibuat.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

// ─── Edit form ────────────────────────────────────────────────────────────────
const editDisplayName = ref('')
const editMetadataUrl = ref('')
const editClientId = ref('')
const editClientSecret = ref('')
const editAlgorithms = ref('RS256')
const editScopes = ref('openid')
const editPriority = ref(100)
const editEnabled = ref(true)
const editIsBackup = ref(false)
const editTlsValidation = ref(true)
const editSigValidation = ref(true)

watch(
  () => store.selectedProvider,
  (provider) => {
    editDisplayName.value = provider?.display_name ?? ''
    editMetadataUrl.value = provider?.metadata_url ?? ''
    editClientId.value = provider?.client_id ?? ''
    editClientSecret.value = ''
    editAlgorithms.value = (provider?.allowed_algorithms ?? ['RS256']).join(', ')
    editScopes.value = (provider?.scopes ?? ['openid']).join(', ')
    editPriority.value = provider?.priority ?? 100
    editEnabled.value = provider?.enabled ?? true
    editIsBackup.value = provider?.is_backup ?? false
    editTlsValidation.value = provider?.tls_validation_enabled ?? true
    editSigValidation.value = provider?.signature_validation_enabled ?? true

    activeDetailTab.value = 'overview'
  },
  { immediate: true },
)

async function submitEditProvider(): Promise<void> {
  successMessage.value = null
  store.errorMessage = null

  const payload: ExternalIdpUpdatePayload = {
    display_name: editDisplayName.value.trim() || undefined,
    metadata_url: editMetadataUrl.value.trim() || undefined,
    client_id: editClientId.value.trim() || undefined,
    ...(editClientSecret.value.trim() && { client_secret: editClientSecret.value.trim() }),
    allowed_algorithms: editAlgorithms.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    scopes: editScopes.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    priority: editPriority.value,
    enabled: editEnabled.value,
    is_backup: editIsBackup.value,
    tls_validation_enabled: editTlsValidation.value,
    signature_validation_enabled: editSigValidation.value,
  }

  isSaving.value = true
  try {
    await store.updateSelected(payload)
    if (store.actionStatus === 'success') {
      successMessage.value = 'Konfigurasi provider berhasil disimpan.'
      setTimeout(() => {
        if (successMessage.value === 'Konfigurasi provider berhasil disimpan.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

// ─── Delete confirmation ──────────────────────────────────────────────────────
const deleteConfirmKey = ref('')

const canDelete = computed(
  () =>
    !!store.selectedProvider &&
    deleteConfirmKey.value.trim() === store.selectedProvider.provider_key,
)

async function submitDeleteProvider(): Promise<void> {
  if (!canDelete.value) return
  successMessage.value = null
  store.errorMessage = null

  isSaving.value = true
  try {
    await store.deleteSelected()
    if (store.actionStatus === 'success') {
      deleteConfirmKey.value = ''
      successMessage.value = 'Provider berhasil dihapus.'
      setTimeout(() => {
        if (successMessage.value === 'Provider berhasil dihapus.') {
          successMessage.value = null
        }
      }, 5000)
    }
  } finally {
    isSaving.value = false
  }
}

// ─── Avatar Helpers ───────────────────────────────────────────────────────────
function avatarInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : 'P'
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

async function selectProvider(providerKey: string): Promise<void> {
  successMessage.value = null
  store.errorMessage = null
  await store.selectProvider(providerKey)
  activeDetailTab.value = 'overview'
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="external-idps-page" aria-labelledby="idp-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('external_idps.eyebrow') }}</p>
      <h1 id="idp-title">{{ t('external_idps.title') }}</h1>
      <p class="page-summary">{{ t('external_idps.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('external_idps.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Federation"
      :title="t('external_idps.forbidden_title')"
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
      :title="t('external_idps.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div
      v-else
      class="clients-layout"
      :class="{ 'clients-layout--has-selection': store.selectedProviderKey !== null }"
    >
      <!-- ─── Provider list sidebar ─────────────────────────────────────── -->
      <aside class="clients-list idp-list" aria-label="Daftar External IdP">
        <UiEmptyState
          v-if="store.providers.length === 0"
          :title="t('external_idps.empty_title')"
          :description="t('external_idps.empty_desc')"
        />

        <template v-else>
          <!-- Search input -->
          <UiFormField
            id="search-providers"
            label="Cari Provider"
            class="clients-search"
            style="margin-bottom: 16px"
          >
            <div class="clients-search__control">
              <Search :size="16" class="clients-search__icon" aria-hidden="true" />
              <UiInput
                id="search-providers"
                v-model="searchQuery"
                placeholder="Cari provider atau issuer..."
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

          <ul class="user-cards-list ui-data-list" role="list">
            <li v-for="provider in filteredProviders" :key="provider.provider_key">
              <button
                class="user-card-item"
                type="button"
                :class="{
                  'user-card-item--active': provider.provider_key === store.selectedProviderKey,
                }"
                :aria-current="
                  provider.provider_key === store.selectedProviderKey ? 'true' : undefined
                "
                @click="selectProvider(provider.provider_key)"
              >
                <span
                  class="user-card-item__avatar"
                  :style="avatarStyle(provider.display_name ?? provider.provider_key)"
                  aria-hidden="true"
                >
                  {{ avatarInitial(provider.display_name ?? provider.provider_key) }}
                </span>
                <span class="user-card-item__content">
                  <span class="user-card-item__name-row">
                    <span class="user-card-item__name">
                      {{ provider.display_name ?? provider.provider_key }}
                    </span>
                    <span
                      class="user-card-item__badge"
                      :class="provider.enabled ? 'badge--active' : 'badge--inactive'"
                    >
                      {{ provider.enabled ? 'active' : 'inactive' }}
                    </span>
                  </span>
                  <span class="user-card-item__email">{{ provider.provider_key }}</span>
                  <span class="user-card-item__meta">
                    <span class="user-card-item__role">{{
                      provider.health_status ?? 'unknown'
                    }}</span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </template>

        <UiButton
          v-if="canWriteExternalIdps"
          class="create-idp-toggle clients-list__create"
          type="button"
          @click="openCreateForm"
        >
          <Plus :size="16" />
          Add External IdP
        </UiButton>
      </aside>

      <!-- ─── Create provider dialog (accessible modal) ──────────────────── -->
      <div
        v-if="canWriteExternalIdps && showCreateForm"
        class="client-modal-overlay client-modal-overlay--open"
        @click.self="closeCreateForm"
      >
        <div
          ref="createDialogRef"
          class="client-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          tabindex="-1"
          @keydown.esc="closeCreateForm"
        >
          <div class="client-modal-header">
            <h3 id="modal-title">Add External IdP</h3>
            <button
              class="client-modal-close"
              type="button"
              aria-label="Tutup dialog"
              @click="closeCreateForm"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="client-modal-body">
            <form class="client-form" @submit.prevent="submitCreateProvider">
              <!-- Error message inside modal -->
              <p
                v-if="store.errorMessage && store.actionStatus === 'error'"
                class="ui-action-message ui-action-message--error"
                role="alert"
                style="margin-bottom: 16px"
              >
                {{ store.errorMessage }}
              </p>

              <div class="user-form-grid">
                <UiFormField id="create-provider-key" label="Provider key" required>
                  <UiInput
                    id="create-provider-key"
                    v-model="createProviderKey"
                    name="create-provider-key"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-display-name" label="Display name" required>
                  <UiInput
                    id="create-display-name"
                    v-model="createDisplayName"
                    name="create-display-name"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-issuer" label="Issuer URL" required>
                  <UiInput
                    id="create-issuer"
                    v-model="createIssuer"
                    name="create-issuer"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-metadata-url" label="Metadata URL" required>
                  <UiInput
                    id="create-metadata-url"
                    v-model="createMetadataUrl"
                    name="create-metadata-url"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-client-id" label="Client ID" required>
                  <UiInput
                    id="create-client-id"
                    v-model="createClientId"
                    name="create-client-id"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-client-secret" label="Client secret">
                  <UiInput
                    id="create-client-secret"
                    v-model="createClientSecret"
                    name="create-client-secret"
                    type="password"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-algorithms" label="Allowed algorithms (comma-separated)">
                  <UiInput
                    id="create-algorithms"
                    v-model="createAlgorithms"
                    name="create-algorithms"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-scopes" label="Scopes (comma-separated)">
                  <UiInput
                    id="create-scopes"
                    v-model="createScopes"
                    name="create-scopes"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="create-priority" label="Priority">
                  <input
                    id="create-priority"
                    v-model.number="createPriority"
                    class="ui-control"
                    name="create-priority"
                    type="number"
                  />
                </UiFormField>
              </div>

              <!-- Switches grouped into sub-actions -->
              <div class="user-detail__sub-actions" style="margin-top: 20px">
                <h4 class="user-detail__sub-actions-title">Initial State</h4>
                <div class="user-form-grid user-form-grid-2" style="margin-top: 8px">
                  <UiSwitch v-model="createEnabled" label="Enabled" />
                  <UiSwitch v-model="createIsBackup" label="Backup failover" />
                </div>
              </div>
            </form>
          </div>

          <div class="client-modal-footer">
            <UiButton variant="secondary" type="button" @click="closeCreateForm"> Cancel </UiButton>
            <UiButton
              variant="primary"
              type="button"
              class="create-idp-submit"
              :disabled="isSaving"
              @click="submitCreateProvider"
            >
              {{ isSaving ? 'Creating...' : 'Create' }}
            </UiButton>
          </div>
        </div>
      </div>

      <!-- ─── Provider detail ───────────────────────────────────────────── -->
      <article v-if="store.selectedProvider" class="client-detail provider-detail">
        <!-- Mobile back button to list view -->
        <div class="client-detail-back-bar">
          <UiButton variant="secondary" size="sm" @click="store.selectedProviderKey = null">
            <ChevronLeft :size="16" />
            {{ t('common.back_to_list') }}
          </UiButton>
        </div>

        <!-- Hero Header matching UsersPage and ClientsPage -->
        <header class="client-profile-hero">
          <div
            class="client-profile-hero__avatar"
            :style="
              avatarStyle(
                store.selectedProvider.display_name ?? store.selectedProvider.provider_key,
              )
            "
            aria-hidden="true"
          >
            {{
              avatarInitial(
                store.selectedProvider.display_name ?? store.selectedProvider.provider_key,
              )
            }}
          </div>
          <div class="client-profile-hero__content">
            <div class="client-profile-hero__header-row">
              <h2>{{ store.selectedProvider.display_name }}</h2>
              <span
                class="ui-badge"
                :class="store.selectedProvider.enabled ? 'badge--active' : 'badge--inactive'"
              >
                {{ store.selectedProvider.enabled ? 'enabled' : 'disabled' }}
              </span>
            </div>
            <p class="client-profile-hero__env">{{ store.selectedProvider.issuer }}</p>
            <p class="client-profile-hero__client-id">{{ store.selectedProvider.provider_key }}</p>
          </div>
        </header>

        <!-- Tabs Navigation -->
        <nav class="client-detail-tabs" role="tablist" aria-label="External IDP Tabs">
          <button
            v-for="(tab, index) in detailTabs"
            :key="tab.key"
            :id="`idp-tab-${tab.key}`"
            class="client-detail-tab"
            :class="{ 'client-detail-tab--active': activeDetailTab === tab.key }"
            role="tab"
            :aria-selected="activeDetailTab === tab.key"
            :aria-controls="`idp-panel-${tab.key}`"
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
          style="margin-bottom: 20px; width: 100%"
        >
          <p
            v-if="store.errorMessage"
            class="ui-action-message ui-action-message--error"
            role="alert"
            style="margin-bottom: 8px"
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

        <!-- ─── Tab 1: Overview ─────────────────────────────────────────── -->
        <div
          v-show="activeDetailTab === 'overview'"
          id="idp-panel-overview"
          role="tabpanel"
          aria-labelledby="idp-tab-overview"
          class="tab-panel"
        >
          <dl class="detail-grid">
            <div>
              <dt>client_id</dt>
              <dd>
                <code>{{ store.selectedProvider.client_id }}</code>
              </dd>
            </div>
            <div>
              <dt>metadata_url</dt>
              <dd>
                <code>{{ store.selectedProvider.metadata_url }}</code>
              </dd>
            </div>
            <div v-if="store.selectedProvider.jwks_uri">
              <dt>jwks_uri</dt>
              <dd>
                <code>{{ store.selectedProvider.jwks_uri }}</code>
              </dd>
            </div>
            <div>
              <dt>algorithms</dt>
              <dd>{{ (store.selectedProvider.allowed_algorithms ?? ['RS256']).join(', ') }}</dd>
            </div>
            <div>
              <dt>scopes</dt>
              <dd>{{ (store.selectedProvider.scopes ?? ['openid']).join(', ') }}</dd>
            </div>
            <div>
              <dt>health</dt>
              <dd>{{ store.selectedProvider.health_status ?? 'unknown' }}</dd>
            </div>
            <div>
              <dt>client credential</dt>
              <dd>{{ store.selectedProvider.has_client_secret ? 'configured' : 'not set' }}</dd>
            </div>
            <div>
              <dt>tls_validation</dt>
              <dd>{{ store.selectedProvider.tls_validation_enabled ? 'Active' : 'Disabled' }}</dd>
            </div>
            <div>
              <dt>signature_validation</dt>
              <dd>
                {{ store.selectedProvider.signature_validation_enabled ? 'Active' : 'Disabled' }}
              </dd>
            </div>
            <!-- Mapping status summary for testing & operator overview -->
            <div v-if="store.mappingPreview">
              <dt>mapping status</dt>
              <dd>{{ store.mappingPreview.safe_to_link ? 'safe to link' : 'not safe to link' }}</dd>
            </div>
          </dl>

          <!-- Circuit Breaker / Failure Info -->
          <div
            v-if="store.selectedProvider.consecutive_failures"
            class="ui-card ui-card--danger"
            style="margin-top: 24px"
          >
            <h4 style="font-weight: 800; margin-bottom: 8px; color: var(--destructive)">
              Circuit Breaker Alert
            </h4>
            <p style="margin-bottom: 4px">
              Consecutive Failures:
              <strong>{{ store.selectedProvider.consecutive_failures }}</strong>
            </p>
            <p v-if="store.selectedProvider.breaker_tripped_at" style="margin-bottom: 4px">
              Breaker Tripped At:
              <strong>{{ dateFormat.smart(store.selectedProvider.breaker_tripped_at) }}</strong>
            </p>
            <p v-if="store.selectedProvider.breaker_reason" style="margin: 0">
              Breaker Reason: <code>{{ store.selectedProvider.breaker_reason }}</code>
            </p>
          </div>
        </div>

        <!-- ─── Tab 2: Configuration ───────────────────────────────────── -->
        <div
          v-show="activeDetailTab === 'config'"
          id="idp-panel-config"
          role="tabpanel"
          aria-labelledby="idp-tab-config"
          class="tab-panel"
        >
          <section
            v-if="canWriteExternalIdps"
            class="detail-section"
            aria-labelledby="edit-idp-title"
          >
            <h3 id="edit-idp-title">Edit Provider</h3>
            <form class="client-form" @submit.prevent="submitEditProvider">
              <div class="user-form-grid user-form-grid-2">
                <UiFormField id="edit-display-name" label="Display name">
                  <UiInput
                    id="edit-display-name"
                    v-model="editDisplayName"
                    name="edit-display-name"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit-metadata-url" label="Metadata URL">
                  <UiInput
                    id="edit-metadata-url"
                    v-model="editMetadataUrl"
                    name="edit-metadata-url"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit-client-id" label="Client ID">
                  <UiInput
                    id="edit-client-id"
                    v-model="editClientId"
                    name="edit-client-id"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField
                  id="edit-client-secret"
                  label="Client secret (kosong = tetap pakai yang ada)"
                >
                  <UiInput
                    id="edit-client-secret"
                    v-model="editClientSecret"
                    name="edit-client-secret"
                    type="password"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit-algorithms" label="Allowed algorithms (comma-separated)">
                  <UiInput
                    id="edit-algorithms"
                    v-model="editAlgorithms"
                    name="edit-algorithms"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit-scopes" label="Scopes (comma-separated)">
                  <UiInput
                    id="edit-scopes"
                    v-model="editScopes"
                    name="edit-scopes"
                    autocomplete="off"
                  />
                </UiFormField>
                <UiFormField id="edit-priority" label="Priority">
                  <input
                    id="edit-priority"
                    v-model.number="editPriority"
                    class="ui-control"
                    name="edit-priority"
                    type="number"
                  />
                </UiFormField>
              </div>

              <!-- Switches grouped into sub-actions -->
              <div class="user-detail__sub-actions" style="margin-top: 20px">
                <h4 class="user-detail__sub-actions-title">Security & Protocol Features</h4>
                <div class="user-form-grid user-form-grid-2" style="margin-top: 8px">
                  <UiSwitch v-model="editEnabled" label="Enabled" />
                  <UiSwitch v-model="editIsBackup" label="Backup failover" />
                  <UiSwitch v-model="editTlsValidation" label="TLS validation" />
                  <UiSwitch v-model="editSigValidation" label="Signature validation" />
                </div>
              </div>

              <div class="user-detail-card__actions" style="margin-top: 24px">
                <UiButton
                  variant="primary"
                  type="button"
                  class="edit-idp-submit"
                  :disabled="isSaving"
                  @click="submitEditProvider"
                >
                  {{ isSaving ? 'Saving...' : 'Save changes' }}
                </UiButton>
              </div>
            </form>
          </section>
        </div>

        <!-- ─── Tab 3: Mapping Preview ─────────────────────────────────── -->
        <div
          v-show="activeDetailTab === 'mapping'"
          id="idp-panel-mapping"
          role="tabpanel"
          aria-labelledby="idp-tab-mapping"
          class="tab-panel"
        >
          <section
            v-if="canWriteExternalIdps"
            class="detail-section"
            aria-labelledby="idp-mapping-title"
          >
            <h3 id="idp-mapping-title">Mapping preview</h3>
            <p style="margin-bottom: 16px; color: var(--muted-foreground)">
              Uji pemetaan klaim token dari OIDC provider eksternal ke skema SSO local.
            </p>
            <form class="client-form" @submit.prevent="previewMapping">
              <UiFormField id="mapping-claims" label="Sample claims JSON">
                <UiTextarea id="mapping-claims" v-model="mappingClaims" :rows="4" />
              </UiFormField>
              <div class="user-detail-card__actions" style="margin-top: 16px">
                <UiButton variant="primary" type="submit" :disabled="isSaving">
                  {{ isSaving ? 'Memproses...' : 'Preview mapping' }}
                </UiButton>
              </div>
            </form>

            <div
              v-if="store.mappingPreview"
              class="ui-card"
              style="margin-top: 24px; border: 1px solid var(--border); padding: 16px"
            >
              <h4 style="font-weight: 800; margin-bottom: 12px">Mapping Results</h4>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px">
                <p style="margin: 0">
                  Safe to link:
                  <span
                    class="ui-badge"
                    :class="store.mappingPreview.safe_to_link ? 'badge--active' : 'badge--inactive'"
                    >{{ store.mappingPreview.safe_to_link ? 'Yes' : 'No' }}</span
                  >
                </p>
                <p style="margin: 0">
                  Missing email strategy:
                  <code>{{ store.mappingPreview.missing_email_strategy }}</code>
                </p>
              </div>

              <div v-if="store.mappingPreview.mapped">
                <h5
                  style="
                    font-size: 0.88rem;
                    font-weight: 800;
                    color: var(--muted-foreground);
                    text-transform: uppercase;
                    margin-bottom: 6px;
                  "
                >
                  Mapped Claims
                </h5>
                <pre
                  class="policy-json"
                  style="
                    max-height: 250px;
                    overflow-y: auto;
                    background: var(--muted);
                    border-radius: 8px;
                    padding: 12px;
                    font-family: monospace;
                  "
                  >{{ JSON.stringify(store.mappingPreview.mapped, null, 2) }}</pre
                >
              </div>

              <div v-if="store.mappingPreview.warnings.length > 0" style="margin-top: 16px">
                <h5 style="color: var(--warning); font-weight: 800; margin-bottom: 6px">
                  Warnings
                </h5>
                <ul style="list-style-type: disc; padding-left: 20px">
                  <li
                    v-for="warning in store.mappingPreview.warnings"
                    :key="warning"
                    class="muted"
                    style="margin-bottom: 4px"
                  >
                    {{ warning }}
                  </li>
                </ul>
              </div>

              <div v-if="store.mappingPreview.errors.length > 0" style="margin-top: 16px">
                <h5 style="color: var(--destructive); font-weight: 800; margin-bottom: 6px">
                  Errors
                </h5>
                <ul style="list-style-type: disc; padding-left: 20px">
                  <li
                    v-for="error in store.mappingPreview.errors"
                    :key="error"
                    class="ui-card--danger"
                    style="margin-bottom: 4px; padding: 4px 8px; border-radius: 4px"
                  >
                    {{ error }}
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <!-- ─── Tab 4: Lifecycle ───────────────────────────────────────── -->
        <div
          v-show="activeDetailTab === 'lifecycle'"
          id="idp-panel-lifecycle"
          role="tabpanel"
          aria-labelledby="idp-tab-lifecycle"
          class="tab-panel"
        >
          <section
            v-if="canDeleteExternalIdps"
            class="detail-section detail-section--danger"
            aria-labelledby="delete-idp-title"
          >
            <h3 id="delete-idp-title">Delete Provider</h3>
            <p style="margin-bottom: 16px">
              Tindakan destruktif: menghapus provider eksternal secara permanen. Tindakan ini tidak
              dapat dibatalkan.
            </p>

            <div class="user-detail__sub-actions">
              <h4 class="user-detail__sub-actions-title">Decommission Provider</h4>
              <p class="user-detail-card__hint" style="margin-bottom: 8px">
                Untuk menghapus provider, ketik provider key
                <code>{{ store.selectedProvider.provider_key }}</code> di bawah untuk konfirmasi.
              </p>
              <UiFormField id="delete-confirm-key" label="Konfirmasi provider key">
                <UiInput
                  id="delete-confirm-key"
                  v-model="deleteConfirmKey"
                  name="delete-confirm-key"
                  autocomplete="off"
                  placeholder="Ketik provider key..."
                />
              </UiFormField>
              <div class="user-detail-card__actions">
                <UiButton
                  variant="danger"
                  class="delete-idp-button"
                  type="button"
                  :disabled="!canDelete || isSaving"
                  @click="submitDeleteProvider"
                >
                  {{ isSaving ? 'Memproses...' : 'Delete Provider' }}
                </UiButton>
              </div>
            </div>
          </section>
        </div>

        <EvidenceContextPanel
          title="Federation evidence"
          :request-id="store.requestId"
          :client-id="store.selectedProvider.client_id"
          style="margin-top: 24px"
        />
      </article>

      <!-- ─── Empty state when no provider selected ─────────────────────── -->
      <section v-else class="client-detail-empty" role="status">
        <UiEmptyState
          title="No provider selected"
          description="Pilih provider dari daftar untuk melihat detail konfigurasi dan preview mapping."
        />
      </section>
    </div>

    <EvidenceContextPanel
      v-if="!store.selectedProvider"
      title="Federation evidence"
      :request-id="store.requestId"
    />
  </section>
</template>
