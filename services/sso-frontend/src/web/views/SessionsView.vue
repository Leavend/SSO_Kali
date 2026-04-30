<script setup lang="ts">
import { onMounted } from 'vue'
import { Inbox, RefreshCw, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, truncateId } from '@shared/format'

const admin = useAdminStore()

onMounted(() => {
  admin.loadSessions()
})
</script>

<template>
  <section class="content-stack">
    <PageHeader eyebrow="Runtime" title="Sessions" description="Sesi SSO aktif yang bisa dicabut oleh administrator." />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadSessions">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div v-if="admin.sessions.length > 0" class="data-table">
      <div class="data-row data-row--head data-row--sessions">
        <span>Sesi</span>
        <span>Pengguna</span>
        <span>Client</span>
        <span>Kedaluwarsa</span>
        <span></span>
      </div>
      <div
        v-for="session in admin.sessions"
        :key="`${session.session_id}:${session.client_id}`"
        class="data-row data-row--sessions"
      >
        <span>{{ truncateId(session.session_id) }}</span>
        <span>
          <strong>{{ session.display_name }}</strong>
          <small>{{ session.email }}</small>
        </span>
        <span>{{ session.client_id }}</span>
        <span>{{ formatDateTime(session.expires_at) }}</span>
        <span>
          <button
            v-if="admin.canManageSessions"
            class="icon-button"
            type="button"
            title="Cabut sesi"
            @click="admin.revokeSession(session.session_id)"
          >
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>

    <div v-else class="panel panel-empty--large">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Tidak ada sesi aktif</h3>
      <p>Sesi akan muncul setelah pengguna melakukan login melalui SSO broker.</p>
    </div>
  </section>
</template>
