<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { RouterLink, RouterView } from 'vue-router'
import { useAdminStore } from './stores/admin'

const admin = useAdminStore()
let refreshTimer: number | undefined

onMounted(() => {
  admin.bootstrap()
  refreshTimer = window.setInterval(() => {
    admin.refreshWhenNeeded()
  }, 60_000)
})

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <div class="app-shell">
    <aside v-if="admin.isAuthenticated" class="sidebar" aria-label="Admin navigation">
      <RouterLink class="brand" to="/dashboard">
        <ShieldCheck :size="22" aria-hidden="true" />
        <span>SSO Admin</span>
      </RouterLink>

      <nav class="nav-list">
        <RouterLink to="/dashboard">Dashboard</RouterLink>
        <RouterLink to="/users">Users</RouterLink>
        <RouterLink to="/sessions">Sessions</RouterLink>
        <RouterLink to="/apps">Apps</RouterLink>
      </nav>

      <div class="sidebar-footer">
        <div class="principal">
          <strong>{{ admin.principal?.displayName }}</strong>
          <span>{{ admin.principal?.email }}</span>
        </div>
        <div class="sidebar-actions">
          <button class="icon-button" type="button" title="Refresh session" @click="admin.refreshSession">
            <RefreshCw :size="18" aria-hidden="true" />
          </button>
          <a class="icon-button" title="Logout" href="/auth/logout">
            <LogOut :size="18" aria-hidden="true" />
          </a>
        </div>
      </div>
    </aside>

    <main class="main-surface" :class="{ 'main-surface--auth': !admin.isAuthenticated }">
      <RouterView />
    </main>
  </div>
</template>
