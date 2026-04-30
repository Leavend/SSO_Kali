<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Inbox, Trash2 } from 'lucide-vue-next'
import type { ApiSession, ApiUser } from '@shared/admin'
import PageHeader from '@/components/PageHeader.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, truncateId } from '@shared/format'

const route = useRoute()
const admin = useAdminStore()
const user = ref<ApiUser | null>(null)
const sessions = ref<ApiSession[]>([])

onMounted(async () => {
  const payload = await admin.fetchUser(String(route.params.id))
  user.value = payload.user
  sessions.value = payload.sessions
})
</script>

<template>
  <section class="content-stack">
    <PageHeader eyebrow="Identity" :title="user?.display_name ?? 'Detail Pengguna'" :description="user?.email" />

    <article v-if="user" class="panel">
      <div class="detail-grid">
        <span>Subject ID</span>
        <strong>{{ user.subject_id }}</strong>
        <span>Role</span>
        <strong>{{ user.role }}</strong>
        <span>Login Terakhir</span>
        <strong>{{ formatDateTime(user.last_login_at) }}</strong>
        <span>Skor Risiko</span>
        <strong>{{ user.login_context?.risk_score ?? 0 }}</strong>
      </div>
    </article>

    <article class="panel">
      <div class="panel-title">
        <h2>Sesi Aktif</h2>
        <button
          v-if="user && admin.canManageSessions"
          class="icon-button"
          type="button"
          title="Cabut semua sesi"
          @click="admin.revokeUserSessions(user.subject_id)"
        >
          <Trash2 :size="18" aria-hidden="true" />
        </button>
      </div>
      <div v-if="sessions.length > 0" class="data-table">
        <div class="data-row data-row--head">
          <span>Sesi</span>
          <span>Client</span>
          <span>Kedaluwarsa</span>
        </div>
        <div v-for="session in sessions" :key="session.session_id" class="data-row">
          <span>{{ truncateId(session.session_id) }}</span>
          <span>{{ session.client_id }}</span>
          <span>{{ formatDateTime(session.expires_at) }}</span>
        </div>
      </div>
      <div v-else class="panel-empty">
        <Inbox :size="24" aria-hidden="true" />
        <p>Tidak ada sesi aktif untuk pengguna ini.</p>
      </div>
    </article>
  </section>
</template>
