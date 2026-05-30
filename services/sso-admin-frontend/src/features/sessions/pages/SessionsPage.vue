<script setup lang="ts">
import { computed, onMounted } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useSessionStore } from '@/stores/session.store'
import { useSessionsStore } from '../stores/sessions.store'

const store = useSessionsStore()
const session = useSessionStore()
const canTerminateSessions = computed(() => session.hasPermission('admin.sessions.terminate'))

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="sessions-page" aria-labelledby="sessions-title">
    <div class="page-heading">
      <h1 id="sessions-title">Sessions</h1>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat sessions...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses sessions ditolak</h2>
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
      <h2>Sessions admin belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.sessions.length === 0" class="state-card" role="status">
      <p>Belum ada sesi yang dapat ditampilkan.</p>
    </div>

    <div v-else>
      <table class="sessions-table">
        <thead>
          <tr>
            <th>Session ID</th>
            <th>Client</th>
            <th>User</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="session in store.sessions" :key="session.session_id">
            <td>{{ session.session_id }}</td>
            <td>{{ session.client_id }}</td>
            <td>{{ session.user_display_name }}</td>
            <td>{{ session.ip_address }}</td>
            <td>
              <button
                v-if="canTerminateSessions"
                class="revoke-button danger-action"
                type="button"
                @click="store.revokeSession(session.session_id)"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="store.actionStatus === 'step_up_required'" class="action-message" role="alert">
        {{ store.errorMessage }}
      </p>
      <p v-if="store.actionStatus === 'error'" class="action-message" role="alert">
        {{ store.errorMessage }}
      </p>

      <EvidenceContextPanel title="Sessions evidence" :request-id="store.requestId" />
    </div>
  </section>
</template>
