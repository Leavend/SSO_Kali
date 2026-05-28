<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useClientsStore } from '../stores/clients.store'

const store = useClientsStore()
const createForm = reactive({
  client_id: '',
  display_name: '',
  redirect_uris: '',
  post_logout_redirect_uris: '',
})
const form = reactive({
  display_name: '',
  owner_email: '',
  redirect_uris: '',
  post_logout_redirect_uris: '',
})
const uriValidationMessages = ref<readonly string[]>([])
const uriValidationMessage = computed(() => uriValidationMessages.value.join(' '))

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

function linesToValues(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function syncFormFromSelected(): void {
  form.display_name = store.selectedClient?.display_name ?? ''
  form.owner_email = store.selectedClient?.owner_email ?? ''
  form.redirect_uris = store.selectedClient?.redirect_uris.join('\n') ?? ''
  form.post_logout_redirect_uris = store.selectedClient?.post_logout_redirect_uris?.join('\n') ?? ''
}

function findUriValidationMessages(
  redirectUris: readonly string[],
  logoutUris: readonly string[],
): string[] {
  const messages: string[] = []
  const allUris = [...redirectUris, ...logoutUris]

  if (allUris.some((uri) => !URL.canParse(uri))) {
    messages.push('Redirect URI harus URL valid.')
  }

  if (new Set(allUris).size !== allUris.length) {
    messages.push('Redirect URI tidak boleh duplikat.')
  }

  return messages
}

async function createClient(): Promise<void> {
  const redirectUris = linesToValues(createForm.redirect_uris)
  const logoutUris = linesToValues(createForm.post_logout_redirect_uris)
  uriValidationMessages.value = findUriValidationMessages(redirectUris, logoutUris)

  if (uriValidationMessages.value.length > 0) return

  await store.createClient({
    client_id: createForm.client_id,
    display_name: createForm.display_name,
    redirect_uris: redirectUris,
    post_logout_redirect_uris: logoutUris,
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
  uriValidationMessages.value = findUriValidationMessages(redirectUris, logoutUris)

  if (uriValidationMessages.value.length > 0) return

  await store.updateSelected({
    redirect_uris: redirectUris,
    post_logout_redirect_uris: logoutUris,
  })
  syncFormFromSelected()
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

    <div v-if="store.status === 'loading'" class="state-card" role="status">
      Memuat OAuth clients...
    </div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses OAuth clients ditolak</h2>
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
      <h2>OAuth clients belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else class="clients-layout">
      <aside class="clients-list" aria-label="Daftar OAuth clients">
        <form
          class="client-form"
          aria-labelledby="create-client-title"
          @submit.prevent="createClient"
        >
          <h2 id="create-client-title">Create OAuth client</h2>
          <label>
            Client ID
            <input v-model="createForm.client_id" name="client_id" autocomplete="off" />
          </label>
          <label>
            Display name
            <input
              v-model="createForm.display_name"
              name="create_display_name"
              autocomplete="off"
            />
          </label>
          <label>
            Redirect URIs
            <textarea v-model="createForm.redirect_uris" name="create_redirect_uris" rows="3" />
          </label>
          <label>
            Post Logout Redirect URIs
            <textarea
              v-model="createForm.post_logout_redirect_uris"
              name="create_post_logout_redirect_uris"
              rows="3"
            />
          </label>
          <button class="primary-action" type="submit">Create client</button>
        </form>

        <button
          v-for="client in store.clients"
          :key="client.client_id"
          class="client-list-item"
          :class="{ 'client-list-item--active': client.client_id === store.selectedClientId }"
          type="button"
          @click="selectClient(client.client_id)"
        >
          <strong>{{ client.display_name ?? client.client_id }}</strong>
          <span>{{ client.client_id }}</span>
          <small>{{ client.status ?? 'unknown' }}</small>
        </button>

        <p v-if="store.clients.length === 0" class="muted">Belum ada OAuth client.</p>
      </aside>

      <article v-if="store.selectedClient" class="client-detail">
        <header class="client-detail__header">
          <div>
            <p class="eyebrow">{{ store.selectedClient.environment ?? 'environment unknown' }}</p>
            <h2>{{ store.selectedClient.display_name ?? store.selectedClient.client_id }}</h2>
            <p>{{ store.selectedClient.client_id }}</p>
          </div>
          <span class="status-pill">{{ store.selectedClient.status ?? 'unknown' }}</span>
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

        <section class="detail-section" aria-labelledby="uri-policy-title">
          <h3 id="uri-policy-title">URI policy</h3>
          <form class="client-form" data-test="uri-policy-form" @submit.prevent="saveUriPolicy">
            <p v-if="uriValidationMessage" class="action-message" role="alert">
              {{ uriValidationMessage }}
            </p>
            <label>
              Redirect URIs
              <textarea v-model="form.redirect_uris" name="redirect_uris" rows="4" />
            </label>
            <label>
              Post Logout Redirect URIs
              <textarea
                v-model="form.post_logout_redirect_uris"
                name="post_logout_redirect_uris"
                rows="4"
              />
            </label>
            <button class="primary-action" type="submit">Simpan URI policy</button>
          </form>
        </section>

        <section class="detail-section" aria-labelledby="metadata-title">
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

        <section class="detail-section detail-section--danger" aria-labelledby="secret-title">
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
    </div>

    <p v-if="store.requestId" class="request-evidence">Request ID: {{ store.requestId }}</p>
  </section>
</template>
