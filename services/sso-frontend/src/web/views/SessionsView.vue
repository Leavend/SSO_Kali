<script setup lang="ts">
import { onMounted } from 'vue'
import { RefreshCw, Trash2 } from 'lucide-vue-next'
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
    <PageHeader eyebrow="Runtime" title="Sessions" description="Active SSO sessions eligible for admin revocation." />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadSessions">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div class="data-table">
      <div class="data-row data-row--head data-row--sessions">
        <span>Session</span>
        <span>User</span>
        <span>Client</span>
        <span>Expires</span>
        <span></span>
      </div>
      <div v-for="session in admin.sessions" :key="session.session_id" class="data-row data-row--sessions">
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
            title="Revoke session"
            @click="admin.revokeSession(session.session_id)"
          >
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  </section>
</template>
