<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Activity, AlertCircle, AppWindow, Inbox, RefreshCw, UsersRound } from 'lucide-vue-next'
import ClientIntegrationProcedure from '@/components/ClientIntegrationProcedure.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatTile from '@/components/StatTile.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, formatRelative } from '@shared/format'

const admin = useAdminStore()

const isLoading = computed(() => admin.status === 'loading')
const isError = computed(() => admin.status === 'error')

onMounted(() => {
  admin.loadDashboard()
})
</script>

<template>
  <section class="content-stack" aria-labelledby="operations-title">
    <PageHeader
      eyebrow="Operations"
      title="Dashboard"
      description="Ringkasan operasional dan monitoring SSO admin broker."
    />

    <div class="toolbar" role="toolbar" aria-label="Aksi dashboard">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadDashboard"
      >
        <RefreshCw
          :size="18"
          aria-hidden="true"
          :class="{ 'animate-spin': isLoading }"
        />
        {{ isLoading ? 'Memuat...' : 'Refresh' }}
      </button>
    </div>

    <!-- Error state -->
    <div v-if="isError" class="error-banner" role="alert">
      <AlertCircle :size="20" aria-hidden="true" />
      <p>{{ admin.errorMessage ?? 'Gagal memuat data dashboard. Silakan coba lagi.' }}</p>
    </div>

    <!-- Stats overview -->
    <div class="stat-grid" role="group" aria-label="Statistik ringkasan">
      <StatTile
        label="Users"
        :value="admin.users.length"
        :detail="`${admin.mfaUsers} memerlukan MFA`"
        :loading="isLoading"
      />
      <StatTile
        label="Subjek Aktif"
        :value="admin.activeUsers"
        detail="dari sesi yang aktif"
        :loading="isLoading"
      />
      <StatTile
        label="Sessions"
        :value="admin.sessions.length"
        detail="dikeluarkan oleh SSO"
        :loading="isLoading"
      />
      <StatTile
        label="Clients"
        :value="admin.clients.length"
        detail="aplikasi terdaftar"
        :loading="isLoading"
      />
    </div>

    <ClientIntegrationProcedure />

    <!-- Detail panels -->
    <div class="panel-grid">
      <!-- Recent users panel -->
      <article class="panel" aria-labelledby="panel-users-title">
        <div class="panel-title">
          <div class="panel-title__left">
            <UsersRound :size="18" aria-hidden="true" />
            <h2 id="panel-users-title">Pengguna Terbaru</h2>
          </div>
          <RouterLink
            v-if="admin.users.length > 5"
            to="/users"
            class="panel-title__link"
            aria-label="Lihat semua pengguna"
          >
            Lihat semua
          </RouterLink>
        </div>
        <div v-if="isLoading" class="panel-loading" aria-busy="true" aria-label="Memuat pengguna">
          <span class="skeleton skeleton--text" v-for="n in 3" :key="n" aria-hidden="true" />
        </div>
        <div v-else-if="admin.users.length > 0" class="list-table" role="list">
          <RouterLink
            v-for="user in admin.users.slice(0, 5)"
            :key="user.subject_id"
            :to="`/users/${user.subject_id}`"
            role="listitem"
            :aria-label="`${user.display_name} — login terakhir ${formatRelative(user.last_login_at)}`"
          >
            <span>{{ user.display_name }}</span>
            <small>{{ formatRelative(user.last_login_at) }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty" role="status">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada data pengguna.</p>
        </div>
      </article>

      <!-- Recent sessions panel -->
      <article class="panel" aria-labelledby="panel-sessions-title">
        <div class="panel-title">
          <div class="panel-title__left">
            <Activity :size="18" aria-hidden="true" />
            <h2 id="panel-sessions-title">Sesi Terakhir</h2>
          </div>
          <RouterLink
            v-if="admin.sessions.length > 5"
            to="/sessions"
            class="panel-title__link"
            aria-label="Lihat semua sesi"
          >
            Lihat semua
          </RouterLink>
        </div>
        <div v-if="isLoading" class="panel-loading" aria-busy="true" aria-label="Memuat sesi">
          <span class="skeleton skeleton--text" v-for="n in 3" :key="n" aria-hidden="true" />
        </div>
        <div v-else-if="admin.sessions.length > 0" class="list-table" role="list">
          <RouterLink
            v-for="session in admin.sessions.slice(0, 5)"
            :key="session.session_id"
            to="/sessions"
            role="listitem"
            :aria-label="`${session.display_name} — berakhir ${formatDateTime(session.expires_at)}`"
          >
            <span>{{ session.display_name }}</span>
            <small>{{ formatDateTime(session.expires_at) }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty" role="status">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada sesi aktif.</p>
        </div>
      </article>

      <!-- Applications panel -->
      <article class="panel" aria-labelledby="panel-apps-title">
        <div class="panel-title">
          <div class="panel-title__left">
            <AppWindow :size="18" aria-hidden="true" />
            <h2 id="panel-apps-title">Aplikasi</h2>
          </div>
          <RouterLink
            v-if="admin.clients.length > 5"
            to="/apps"
            class="panel-title__link"
            aria-label="Lihat semua aplikasi"
          >
            Lihat semua
          </RouterLink>
        </div>
        <div v-if="isLoading" class="panel-loading" aria-busy="true" aria-label="Memuat aplikasi">
          <span class="skeleton skeleton--text" v-for="n in 3" :key="n" aria-hidden="true" />
        </div>
        <div v-else-if="admin.clients.length > 0" class="list-table" role="list">
          <RouterLink
            v-for="client in admin.clients.slice(0, 5)"
            :key="client.client_id"
            to="/apps"
            role="listitem"
            :aria-label="`${client.client_id} — tipe ${client.type}`"
          >
            <span>{{ client.client_id }}</span>
            <small>{{ client.type }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty" role="status">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada aplikasi terdaftar.</p>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.panel-title__left {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.panel-title__link {
  color: var(--admin-accent, #1d4ed8);
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  white-space: nowrap;
}

.panel-title__link:hover {
  text-decoration: underline;
}

.panel-loading {
  display: grid;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) 0;
}

@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }
}
</style>
