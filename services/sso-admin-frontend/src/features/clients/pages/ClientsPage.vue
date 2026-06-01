<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiDataList, { type UiDataListRow } from '@/components/ui/UiDataList.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useSessionStore } from '@/stores/session.store'
import { useClientsStore } from '../stores/clients.store'

const store = useClientsStore()
const session = useSessionStore()
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
const clientRows = computed<readonly UiDataListRow[]>(() =>
  store.clients.map((client) => ({
    id: client.client_id,
    name: client.display_name ?? client.client_id,
    client_id: client.client_id,
    status: client.status ?? 'unknown',
  })),
)

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
  const redirectUri = createForm.redirect_uri.trim()
  const backchannelLogoutUri = createForm.backchannel_logout_uri.trim()
  uriValidationMessages.value = findUriValidationMessages(
    redirectUri === '' ? [] : [redirectUri],
    [],
    backchannelLogoutUri,
  )

  if (uriValidationMessages.value.length > 0 || !isValidUrl(redirectUri)) return

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
  syncFormFromSelected()
}

async function selectClient(clientId: string): Promise<void> {
  await store.selectClient(clientId)
  syncFormFromSelected()
}

async function saveMetadata(): Promise<void> {
  await store.updateSelected({
    display_name: form.display_name,
    owner_email: form.owner_email,
  })
}

async function saveUriPolicy(): Promise<void> {
  const redirectUris = linesToValues(form.redirect_uris)
  const logoutUris = linesToValues(form.post_logout_redirect_uris)
  const backchannelLogoutUri = form.backchannel_logout_uri.trim()
  uriValidationMessages.value = findUriValidationMessages(
    redirectUris,
    logoutUris,
    backchannelLogoutUri,
  )

  if (uriValidationMessages.value.length > 0) return

  await store.updateSelected({
    redirect_uris: redirectUris,
    post_logout_redirect_uris: logoutUris,
    backchannel_logout_uri: backchannelLogoutUri,
  })
  syncFormFromSelected()
}

async function saveScopePolicy(): Promise<void> {
  const allowedScopes = linesToValues(form.allowed_scopes)
  await store.syncSelectedScopes(allowedScopes)
  form.allowed_scopes = allowedScopes.join('\n')
}

async function disableClient(): Promise<void> {
  const reason = lifecycleForm.disable_reason.trim()
  await store.disableSelected({ reason })
  lifecycleForm.disable_reason = ''
}

async function decommissionClient(): Promise<void> {
  if (lifecycleForm.decommission_confirmation !== store.selectedClient?.client_id) {
    lifecycleMessage.value = 'Ketik client ID untuk konfirmasi decommission.'
    return
  }

  await store.decommissionSelected()
  lifecycleForm.decommission_confirmation = ''
  lifecycleMessage.value = null
}

async function rotateSecret(): Promise<void> {
  await store.rotateSelectedSecret()
}
</script>

<template>
  <section class="clients-page" aria-labelledby="clients-title">
    <div class="page-heading">
      <p class="eyebrow">Client Management</p>
      <h1 id="clients-title">OAuth Clients</h1>
      <p class="page-summary">
        Kelola metadata OIDC client, redirect URI evidence, dan rotasi secret aman.
      </p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" label="Memuat OAuth clients" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Client Management"
      title="Akses OAuth clients ditolak"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat OAuth clients.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="OAuth clients belum bisa dimuat"
      :description="
        store.errorMessage ?? 'Coba muat ulang atau gunakan correlation ID untuk investigasi.'
      "
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="clients-layout">
      <aside class="clients-list" aria-label="Daftar OAuth clients">
        <form
          v-if="canWriteClients"
          class="client-form"
          aria-labelledby="create-client-title"
          @submit.prevent="createClient"
        >
          <h2 id="create-client-title">Create OAuth client</h2>
          <UiFormField id="client_id" label="Client ID" required>
            <UiInput
              id="client_id"
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
          <button class="primary-action" type="submit">Create client</button>
        </form>

        <UiEmptyState
          v-if="store.clients.length === 0"
          title="Belum ada OAuth client untuk ditampilkan."
          description="Buat client baru untuk mulai mengelola redirect URI dan scope evidence."
        />

        <UiDataList
          v-else
          caption="Daftar OAuth clients"
          :columns="clientColumns"
          :rows="clientRows"
        >
          <template #actions="{ row }">
            <button
              class="secondary-action"
              :aria-current="row.id === store.selectedClientId ? 'true' : undefined"
              :aria-label="`View ${row.name}`"
              type="button"
              @click="selectClient(row.id)"
            >
              View
            </button>
          </template>
        </UiDataList>
      </aside>

      <article v-if="store.selectedClient" class="client-detail">
        <header class="client-detail__header">
          <div>
            <p class="eyebrow">{{ store.selectedClient.environment ?? 'environment unknown' }}</p>
            <h2>{{ store.selectedClient.display_name ?? store.selectedClient.client_id }}</h2>
            <p>{{ store.selectedClient.client_id }}</p>
          </div>
          <div class="action-row compact-actions">
            <RouterLink
              class="primary-action"
              :to="{
                name: 'admin.audit',
                query: { consent: '1', client_id: store.selectedClient.client_id },
              }"
            >
              Consent trail
            </RouterLink>
            <span class="status-pill">{{ store.selectedClient.status ?? 'unknown' }}</span>
          </div>
        </header>

        <dl class="detail-grid">
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

        <section class="detail-section" aria-labelledby="redirect-uris-title">
          <h3 id="redirect-uris-title">Redirect URIs</h3>
          <ul>
            <li v-for="uri in store.selectedClient.redirect_uris" :key="uri">{{ uri }}</li>
          </ul>
        </section>

        <section class="detail-section" aria-labelledby="logout-uris-title">
          <h3 id="logout-uris-title">Post Logout Redirect URIs</h3>
          <ul>
            <li v-for="uri in store.selectedClient.post_logout_redirect_uris ?? []" :key="uri">
              {{ uri }}
            </li>
          </ul>
        </section>

        <section class="detail-section" aria-labelledby="backchannel-logout-uri-title">
          <h3 id="backchannel-logout-uri-title">Backchannel logout URI</h3>
          <p>{{ store.selectedClient.backchannel_logout_uri ?? 'Belum ada evidence' }}</p>
        </section>

        <section v-if="canWriteClients" class="detail-section" aria-labelledby="uri-policy-title">
          <h3 id="uri-policy-title">URI policy</h3>
          <form class="client-form" data-test="uri-policy-form" @submit.prevent="saveUriPolicy">
            <p v-if="uriValidationMessage" class="action-message" role="alert">
              {{ uriValidationMessage }}
            </p>
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
            <button class="primary-action" type="submit">Simpan URI policy</button>
          </form>
        </section>

        <section v-if="canWriteClients" class="detail-section" aria-labelledby="scope-policy-title">
          <h3 id="scope-policy-title">Scope & consent policy</h3>
          <p v-if="scopeParityWarnings.length > 0" class="action-message" role="status">
            Scope label parity warning: {{ scopeParityWarnings.join(', ') }}
          </p>
          <form class="client-form" data-test="scope-policy-form" @submit.prevent="saveScopePolicy">
            <label>
              Allowed scopes
              <textarea v-model="form.allowed_scopes" name="allowed_scopes" rows="4" />
            </label>
            <button class="primary-action" type="submit">Simpan scope policy</button>
          </form>
        </section>

        <section v-if="canWriteClients" class="detail-section" aria-labelledby="metadata-title">
          <h3 id="metadata-title">Metadata</h3>
          <form class="client-form" @submit.prevent="saveMetadata">
            <label>
              Display name
              <input v-model="form.display_name" name="display_name" autocomplete="off" />
            </label>
            <label>
              Owner email
              <input v-model="form.owner_email" name="owner_email" autocomplete="email" />
            </label>
            <button class="primary-action" type="submit">Simpan metadata</button>
          </form>
        </section>

        <section
          v-if="canManageClientLifecycle"
          class="detail-section detail-section--danger"
          aria-labelledby="lifecycle-title"
        >
          <h3 id="lifecycle-title">Client lifecycle</h3>
          <p>
            Impact summary: disable blocks new authorization and may revoke active tokens.
            Decommission retires client configuration and clears redirect evidence.
          </p>
          <p v-if="lifecycleMessage" class="action-message" role="alert">{{ lifecycleMessage }}</p>
          <label>
            Disable reason
            <textarea
              v-model="lifecycleForm.disable_reason"
              name="client_disable_reason"
              rows="3"
            />
          </label>
          <button
            class="danger-action"
            data-test="disable-client"
            type="button"
            @click="disableClient"
          >
            Disable client
          </button>
          <label>
            Type client ID to decommission
            <input
              v-model="lifecycleForm.decommission_confirmation"
              name="decommission_confirmation"
              autocomplete="off"
            />
          </label>
          <button
            class="danger-action"
            data-test="decommission-client"
            type="button"
            @click="decommissionClient"
          >
            Decommission client
          </button>
        </section>

        <section
          v-if="canWriteClients"
          class="detail-section detail-section--danger"
          aria-labelledby="secret-title"
        >
          <h3 id="secret-title">Client secret</h3>
          <p>Rotasi secret hanya menampilkan plaintext satu kali. Salin lalu hapus dari layar.</p>
          <button class="danger-action" type="button" @click="rotateSecret">Rotate secret</button>
          <div v-if="store.rotationSecret" class="secret-reveal" role="status">
            <strong>Secret baru untuk {{ store.rotationClientId }}</strong>
            <code>{{ store.rotationSecret }}</code>
            <button
              data-test="clear-rotation-secret"
              type="button"
              @click="store.clearRotationSecret"
            >
              Hapus secret dari layar
            </button>
          </div>
        </section>
      </article>

      <section v-else class="state-card" role="status">
        <h2>Belum ada detail client</h2>
        <p>Pilih atau buat OAuth client untuk melihat governance evidence.</p>
      </section>
    </div>

    <EvidenceContextPanel
      title="Client evidence"
      :request-id="store.requestId"
      :client-id="store.selectedClient?.client_id ?? store.rotationClientId"
    />
  </section>
</template>
