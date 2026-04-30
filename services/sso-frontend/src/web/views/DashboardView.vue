<script setup lang="ts">
import { onMounted } from 'vue'
import { Activity, AppWindow, Inbox, RefreshCw, UsersRound } from 'lucide-vue-next'
import ClientIntegrationProcedure from '@/components/ClientIntegrationProcedure.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatTile from '@/components/StatTile.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, formatRelative } from '@shared/format'

const admin = useAdminStore()

onMounted(() => {
  admin.loadDashboard()
})
</script>

<template>
  <section class="content-stack">
    <PageHeader
      eyebrow="Operations"
      title="Dashboard"
      description="Ringkasan operasional dan monitoring SSO admin broker."
    />

    <div class="toolbar">
      <button class="button button--secondary" type="button" @click="admin.loadDashboard">
        <RefreshCw :size="18" aria-hidden="true" />
        Refresh
      </button>
    </div>

    <div class="stat-grid">
      <StatTile label="Users" :value="admin.users.length" :detail="`${admin.mfaUsers} memerlukan MFA`" />
      <StatTile label="Subjek Aktif" :value="admin.activeUsers" detail="dari sesi yang aktif" />
      <StatTile label="Sessions" :value="admin.sessions.length" detail="dikeluarkan oleh SSO" />
      <StatTile label="Clients" :value="admin.clients.length" detail="aplikasi terdaftar" />
    </div>

    <ClientIntegrationProcedure />

    <div class="panel-grid">
      <article class="panel">
        <div class="panel-title">
          <UsersRound :size="18" aria-hidden="true" />
          <h2>Pengguna Terbaru</h2>
        </div>
        <div v-if="admin.users.length > 0" class="list-table">
          <RouterLink v-for="user in admin.users.slice(0, 5)" :key="user.subject_id" :to="`/users/${user.subject_id}`">
            <span>{{ user.display_name }}</span>
            <small>{{ formatRelative(user.last_login_at) }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada data pengguna.</p>
        </div>
      </article>

      <article class="panel">
        <div class="panel-title">
          <Activity :size="18" aria-hidden="true" />
          <h2>Sesi Terakhir</h2>
        </div>
        <div v-if="admin.sessions.length > 0" class="list-table">
          <RouterLink v-for="session in admin.sessions.slice(0, 5)" :key="session.session_id" to="/sessions">
            <span>{{ session.display_name }}</span>
            <small>{{ formatDateTime(session.expires_at) }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada sesi aktif.</p>
        </div>
      </article>

      <article class="panel">
        <div class="panel-title">
          <AppWindow :size="18" aria-hidden="true" />
          <h2>Aplikasi</h2>
        </div>
        <div v-if="admin.clients.length > 0" class="list-table">
          <RouterLink v-for="client in admin.clients.slice(0, 5)" :key="client.client_id" to="/apps">
            <span>{{ client.client_id }}</span>
            <small>{{ client.type }}</small>
          </RouterLink>
        </div>
        <div v-else class="panel-empty">
          <Inbox :size="24" aria-hidden="true" />
          <p>Belum ada aplikasi terdaftar.</p>
        </div>
      </article>
    </div>
  </section>
</template>
