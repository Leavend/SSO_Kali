<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useSessionStore } from '@/stores/session.store'
import { useExternalIdpsStore } from '../stores/external-idps.store'
import type { ExternalIdpCreatePayload, ExternalIdpUpdatePayload } from '../types'

const store = useExternalIdpsStore()
const session = useSessionStore()
const canWriteExternalIdps = computed(() => session.hasPermission('admin.external-idps.write'))
const canDeleteExternalIdps = computed(
  () => canWriteExternalIdps.value && session.hasPermission('admin.sessions.terminate'),
)

// ─── Mapping preview ──────────────────────────────────────────────────────────
const mappingClaims = ref('{"sub":"ext-user-123","email":"user@example.com"}')

async function previewMapping(): Promise<void> {
  const parsed = JSON.parse(mappingClaims.value) as Record<string, unknown>
  await store.previewSelectedMapping(parsed)
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
}

async function submitCreateProvider(): Promise<void> {
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
  await store.createProvider(payload)
  if (store.actionStatus === 'success') {
    resetCreateForm()
    showCreateForm.value = false
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
  },
  { immediate: true },
)

async function submitEditProvider(): Promise<void> {
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
  await store.updateSelected(payload)
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
  await store.deleteSelected()
  deleteConfirmKey.value = ''
}

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="external-idps-page" aria-labelledby="idp-title">
    <div class="page-heading">
      <p class="eyebrow">Federation</p>
      <h1 id="idp-title">External IdPs</h1>
      <p class="page-summary">
        Konfigurasi provider identitas eksternal, health, mapping, dan failover controls.
      </p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat provider...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses External IdP ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>External IdP admin belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else class="idp-layout">
      <!-- ─── Provider list sidebar ─────────────────────────────────────── -->
      <aside class="idp-list" aria-label="Daftar External IdP">
        <button
          v-for="p in store.providers"
          :key="p.provider_key"
          class="idp-list-item"
          :class="{ 'idp-list-item--active': p.provider_key === store.selectedProviderKey }"
          type="button"
          @click="store.selectProvider(p.provider_key)"
        >
          <strong>{{ p.display_name }}</strong>
          <span>{{ p.provider_key }}</span>
          <small
            >{{ p.enabled ? 'enabled' : 'disabled' }} · {{ p.health_status ?? 'unknown' }}</small
          >
        </button>

        <p v-if="store.providers.length === 0" class="muted">
          Belum ada provider eksternal untuk ditampilkan.
        </p>

        <button
          v-if="canWriteExternalIdps"
          class="primary-action create-idp-toggle"
          type="button"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? 'Cancel' : 'Add External IdP' }}
        </button>

        <div v-if="canWriteExternalIdps && showCreateForm" class="create-idp-form">
          <h3>Add External IdP</h3>
          <label class="reason-field">
            Provider key
            <input v-model="createProviderKey" name="create-provider-key" autocomplete="off" />
          </label>
          <label class="reason-field">
            Display name
            <input v-model="createDisplayName" name="create-display-name" autocomplete="off" />
          </label>
          <label class="reason-field">
            Issuer URL
            <input v-model="createIssuer" name="create-issuer" autocomplete="off" />
          </label>
          <label class="reason-field">
            Metadata URL
            <input v-model="createMetadataUrl" name="create-metadata-url" autocomplete="off" />
          </label>
          <label class="reason-field">
            Client ID
            <input v-model="createClientId" name="create-client-id" autocomplete="off" />
          </label>
          <label class="reason-field">
            Client secret
            <input
              v-model="createClientSecret"
              name="create-client-secret"
              type="password"
              autocomplete="off"
            />
          </label>
          <label class="reason-field">
            Allowed algorithms (comma-separated)
            <input v-model="createAlgorithms" name="create-algorithms" autocomplete="off" />
          </label>
          <label class="reason-field">
            Scopes (comma-separated)
            <input v-model="createScopes" name="create-scopes" autocomplete="off" />
          </label>
          <label class="reason-field">
            Priority
            <input v-model.number="createPriority" name="create-priority" type="number" />
          </label>
          <label class="checkbox-row">
            <input v-model="createEnabled" type="checkbox" />
            Enabled
          </label>
          <label class="checkbox-row">
            <input v-model="createIsBackup" type="checkbox" />
            Backup failover
          </label>
          <button
            class="primary-action create-idp-submit"
            type="button"
            :disabled="store.actionStatus === 'loading'"
            @click="submitCreateProvider"
          >
            {{ store.actionStatus === 'loading' ? 'Creating...' : 'Create' }}
          </button>
          <p v-if="store.actionStatus === 'error'" class="action-message">
            {{ store.errorMessage }}
          </p>
          <p v-if="store.actionStatus === 'step_up_required'" class="action-message">
            {{ store.errorMessage }}
          </p>
        </div>
      </aside>

      <!-- ─── Provider detail ───────────────────────────────────────────── -->
      <article v-if="store.selectedProvider" class="provider-detail">
        <header class="user-detail__header">
          <div>
            <p class="eyebrow">{{ store.selectedProvider.provider_key }}</p>
            <h2>{{ store.selectedProvider.display_name }}</h2>
            <p>{{ store.selectedProvider.issuer }}</p>
          </div>
          <span class="status-pill">{{
            store.selectedProvider.enabled ? 'enabled' : 'disabled'
          }}</span>
        </header>

        <dl class="detail-grid">
          <div>
            <dt>client_id</dt>
            <dd>{{ store.selectedProvider.client_id }}</dd>
          </div>
          <div>
            <dt>metadata_url</dt>
            <dd>{{ store.selectedProvider.metadata_url }}</dd>
          </div>
          <div v-if="store.selectedProvider.jwks_uri">
            <dt>jwks_uri</dt>
            <dd>{{ store.selectedProvider.jwks_uri }}</dd>
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
            <dd>{{ store.selectedProvider.tls_validation_enabled }}</dd>
          </div>
          <div>
            <dt>signature_validation</dt>
            <dd>{{ store.selectedProvider.signature_validation_enabled }}</dd>
          </div>
        </dl>

        <div
          v-if="store.selectedProvider.consecutive_failures"
          class="state-card state-card--danger"
        >
          <p>consecutive_failures: {{ store.selectedProvider.consecutive_failures }}</p>
          <p v-if="store.selectedProvider.breaker_tripped_at">
            breaker_tripped_at: {{ store.selectedProvider.breaker_tripped_at }}
          </p>
          <p v-if="store.selectedProvider.breaker_reason">
            breaker_reason: {{ store.selectedProvider.breaker_reason }}
          </p>
        </div>

        <!-- ─── Edit form ─────────────────────────────────────────────── -->
        <section v-if="canWriteExternalIdps" class="detail-section" aria-labelledby="edit-idp-title">
          <h3 id="edit-idp-title">Edit Provider</h3>
          <label class="reason-field">
            Display name
            <input v-model="editDisplayName" name="edit-display-name" autocomplete="off" />
          </label>
          <label class="reason-field">
            Metadata URL
            <input v-model="editMetadataUrl" name="edit-metadata-url" autocomplete="off" />
          </label>
          <label class="reason-field">
            Client ID
            <input v-model="editClientId" name="edit-client-id" autocomplete="off" />
          </label>
          <label class="reason-field">
            Client secret (kosong = tetap pakai yang ada)
            <input
              v-model="editClientSecret"
              name="edit-client-secret"
              type="password"
              autocomplete="off"
            />
          </label>
          <label class="reason-field">
            Allowed algorithms (comma-separated)
            <input v-model="editAlgorithms" name="edit-algorithms" autocomplete="off" />
          </label>
          <label class="reason-field">
            Scopes (comma-separated)
            <input v-model="editScopes" name="edit-scopes" autocomplete="off" />
          </label>
          <label class="reason-field">
            Priority
            <input v-model.number="editPriority" name="edit-priority" type="number" />
          </label>
          <label class="checkbox-row">
            <input v-model="editEnabled" type="checkbox" />
            Enabled
          </label>
          <label class="checkbox-row">
            <input v-model="editIsBackup" type="checkbox" />
            Backup failover
          </label>
          <label class="checkbox-row">
            <input v-model="editTlsValidation" type="checkbox" />
            TLS validation
          </label>
          <label class="checkbox-row">
            <input v-model="editSigValidation" type="checkbox" />
            Signature validation
          </label>
          <button
            class="primary-action edit-idp-submit"
            type="button"
            :disabled="store.actionStatus === 'loading'"
            @click="submitEditProvider"
          >
            {{ store.actionStatus === 'loading' ? 'Saving...' : 'Save changes' }}
          </button>
        </section>

        <!-- ─── Delete section ────────────────────────────────────────── -->
        <section v-if="canDeleteExternalIdps" class="detail-section detail-section--danger" aria-labelledby="delete-idp-title">
          <h3 id="delete-idp-title">Delete Provider</h3>
          <p class="muted">
            Untuk menghapus provider, ketik
            <code>{{ store.selectedProvider.provider_key }}</code> untuk konfirmasi.
          </p>
          <label class="reason-field">
            Konfirmasi provider key
            <input v-model="deleteConfirmKey" name="delete-confirm-key" autocomplete="off" />
          </label>
          <button
            class="danger-action delete-idp-button"
            type="button"
            :disabled="!canDelete || store.actionStatus === 'loading'"
            @click="submitDeleteProvider"
          >
            Delete Provider
          </button>
        </section>

        <p v-if="store.errorMessage && store.actionStatus !== 'idle'" class="action-message">
          {{ store.errorMessage }}
        </p>

        <EvidenceContextPanel
          title="Federation evidence"
          :request-id="store.requestId"
          :client-id="store.selectedProvider.client_id"
        />
      </article>

      <!-- ─── Mapping preview ───────────────────────────────────────────── -->
      <section v-if="canWriteExternalIdps" class="detail-section" aria-labelledby="idp-mapping-title">
        <h2 id="idp-mapping-title">Mapping preview</h2>
        <label class="reason-field">
          Sample claims JSON
          <textarea v-model="mappingClaims" rows="4" />
        </label>
        <button class="primary-action" type="button" @click="previewMapping">
          Preview mapping
        </button>
        <div v-if="store.mappingPreview" class="state-card">
          <p>safe to link: {{ store.mappingPreview.safe_to_link }}</p>
          <p>missing_email_strategy: {{ store.mappingPreview.missing_email_strategy }}</p>
          <div v-if="store.mappingPreview.mapped">
            <pre class="policy-json">{{
              JSON.stringify(store.mappingPreview.mapped, null, 2)
            }}</pre>
          </div>
          <ul v-if="store.mappingPreview.warnings.length > 0">
            <li v-for="warning in store.mappingPreview.warnings" :key="warning" class="muted">
              {{ warning }}
            </li>
          </ul>
          <ul v-if="store.mappingPreview.errors.length > 0">
            <li
              v-for="error in store.mappingPreview.errors"
              :key="error"
              class="state-card--danger"
            >
              {{ error }}
            </li>
          </ul>
        </div>
      </section>
    </div>

    <EvidenceContextPanel
      v-if="!store.selectedProvider"
      title="Federation evidence"
      :request-id="store.requestId"
    />
  </section>
</template>
