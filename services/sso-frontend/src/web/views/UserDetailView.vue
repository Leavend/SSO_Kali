<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Inbox, Trash2, ArrowLeft } from 'lucide-vue-next'
import type { ApiSession, ApiUser } from '@shared/admin'
import PageHeader from '@/web/components/PageHeader.vue'
import { useAdminStore } from '@/web/stores/admin'
import { formatDateTime, truncateId } from '@shared/format'

const route = useRoute()
const admin = useAdminStore()
const user = ref<ApiUser | null>(null)
const sessions = ref<ApiSession[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const payload = await admin.fetchUser(String(route.params.id))
    user.value = payload.user
    sessions.value = payload.sessions
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="content-stack" aria-labelledby="identity-title">
    <div class="toolbar">
      <RouterLink class="button button--secondary" to="/users" aria-label="Kembali ke daftar pengguna">
        <ArrowLeft :size="18" aria-hidden="true" />
        Kembali
      </RouterLink>
    </div>

    <PageHeader
      eyebrow="Identity"
      :title="user?.display_name ?? 'Detail Pengguna'"
      :description="user?.email"
    />

    <!-- User detail -->
    <article v-if="user" class="panel" aria-label="Informasi pengguna">
      <dl class="detail-grid">
        <dt>Subject ID</dt>
        <dd><code>{{ user.subject_id }}</code></dd>
        <dt>Role</dt>
        <dd>{{ user.role }}</dd>
        <dt>Login Terakhir</dt>
        <dd>{{ formatDateTime(user.last_login_at) }}</dd>
        <dt>Skor Risiko</dt>
        <dd>{{ user.login_context?.risk_score ?? 0 }}</dd>
      </dl>
    </article>
    <div v-else-if="loading" class="panel" aria-busy="true">
      <span class="skeleton skeleton--text" aria-hidden="true" />
      <span class="skeleton skeleton--text" style="width: 40%" aria-hidden="true" />
    </div>

    <!-- Active sessions -->
    <article class="panel" aria-labelledby="user-sessions-title">
      <div class="panel-title">
        <h2 id="user-sessions-title">Sesi Aktif</h2>
        <button
          v-if="user && admin.canManageSessions && sessions.length > 0"
          class="button button--danger"
          type="button"
          :aria-label="`Cabut semua sesi milik ${user.display_name}`"
          @click="admin.revokeUserSessions(user.subject_id)"
        >
          <Trash2 :size="16" aria-hidden="true" />
          Cabut Semua
        </button>
      </div>
      <div v-if="sessions.length > 0" class="data-table" role="table" aria-label="Sesi aktif pengguna">
        <div class="data-row data-row--head" role="row" aria-hidden="true">
          <span role="columnheader">Sesi</span>
          <span role="columnheader">Client</span>
          <span role="columnheader">Kedaluwarsa</span>
        </div>
        <div
          v-for="session in sessions"
          :key="session.session_id"
          class="data-row"
          role="row"
        >
          <span data-label="Sesi" role="cell">{{ truncateId(session.session_id) }}</span>
          <span data-label="Client" role="cell">{{ session.client_id }}</span>
          <span data-label="Kedaluwarsa" role="cell">{{ formatDateTime(session.expires_at) }}</span>
        </div>
      </div>
      <div v-else class="panel-empty" role="status">
        <Inbox :size="24" aria-hidden="true" />
        <p>Tidak ada sesi aktif untuk pengguna ini.</p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.detail-grid {
  margin: 0;
}

.detail-grid dt {
  color: var(--admin-subtle, #64748b);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
}

.detail-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--admin-ink, #0f172a);
}

.detail-grid code {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm, 13px);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 6px);
  background: var(--admin-panel-muted, #f1f5f9);
}
</style>
