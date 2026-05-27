<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useClientsStore } from '../stores/clients.store'

const store = useClientsStore()
const form = reactive({
  display_name: '',
  owner_email: '',
})

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

async function selectClient(clientId: string): Promise<void> {
  await store.selectClient(clientId)
  form.display_name = store.selectedClient?.display_name ?? ''
  form.owner_email = store.selectedClient?.owner_email ?? ''
}

async function saveMetadata(): Promise<void> {
  await store.updateSelected({
    display_name: form.display_name,
    owner_email: form.owner_email,
  })
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
