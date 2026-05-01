<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Inbox, RefreshCw, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, truncateId } from '@shared/format'

const admin = useAdminStore()
const isLoading = computed(() => admin.status === 'loading')

onMounted(() => {
  admin.loadSessions()
})
</script>

<template>
  <section class="content-stack" aria-labelledby="runtime-title">
    <PageHeader eyebrow="Runtime" title="Sessions" description="Sesi SSO aktif yang bisa dicabut oleh administrator." />

    <div class="toolbar" role="toolbar" aria-label="Aksi sesi">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadSessions"
      >
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.sessions.length > 0" class="sessions-list" role="list" aria-label="Daftar sesi aktif">
      <article
        v-for="session in admin.sessions"
        :key="`${session.session_id}:${session.client_id}`"
        class="session-card"
        role="listitem"
        :aria-label="`Sesi aktif ${session.display_name} untuk ${session.client_id}`"
      >
        <div class="session-card__main">
          <div class="session-card__identity">
            <span class="session-card__eyebrow">Pengguna aktif</span>
            <h2>{{ session.display_name }}</h2>
            <p>{{ session.email }}</p>
          </div>

          <dl class="session-card__meta" aria-label="Detail sesi">
            <div class="session-detail session-detail--client">
              <dt>Client</dt>
              <dd>{{ session.client_id }}</dd>
            </div>
            <div class="session-detail">
              <dt>Kedaluwarsa</dt>
              <dd>{{ formatDateTime(session.expires_at) }}</dd>
            </div>
            <div class="session-detail session-detail--mono">
              <dt>Session ID</dt>
              <dd>{{ truncateId(session.session_id) }}</dd>
            </div>
          </dl>
        </div>

        <div v-if="admin.canManageSessions" class="session-card__actions">
          <button
            class="button button--danger session-card__revoke"
            type="button"
            :aria-label="`Cabut sesi milik ${session.display_name}`"
            @click="admin.revokeSession(session.session_id)"
          >
            <Trash2 :size="18" aria-hidden="true" />
            Cabut sesi
          </button>
        </div>
      </article>
    </div>

    <div v-else class="panel panel-empty--large" role="status">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Tidak ada sesi aktif</h3>
      <p>Sesi akan muncul setelah pengguna melakukan login melalui SSO broker.</p>
    </div>
  </section>
</template>
