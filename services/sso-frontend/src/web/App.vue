<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { LogOut, Menu, RefreshCw, ShieldCheck, X } from "lucide-vue-next";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { useAdminStore } from "./stores/admin";

const admin = useAdminStore();
const route = useRoute();
const sidebarOpen = ref(false);
const showAdminShell = computed(() => Boolean(route.meta.requiresAuth) && admin.isAuthenticated);
let refreshTimer: number | undefined;

onMounted(() => {
  admin.bootstrap();
  refreshTimer = window.setInterval(() => {
    admin.refreshWhenNeeded();
  }, 60_000);
});

onUnmounted(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});

function closeSidebar(): void {
  sidebarOpen.value = false;
}

watch(() => route.path, closeSidebar);
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--auth': !showAdminShell,
      'app-shell--admin': showAdminShell,
    }"
  >
    <template v-if="showAdminShell">
      <button
        class="hamburger-toggle"
        v-if="!sidebarOpen"
        type="button"
        aria-controls="admin-sidebar"
        aria-label="Open menu"
        :aria-expanded="sidebarOpen"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Menu :size="20" aria-hidden="true" />
      </button>

      <Transition name="fade">
        <div
          v-if="sidebarOpen"
          class="sidebar-backdrop"
          @click="closeSidebar"
        />
      </Transition>

      <aside
        id="admin-sidebar"
        class="sidebar"
        :class="{ 'sidebar--open': sidebarOpen }"
        aria-label="Admin navigation"
      >
        <div class="sidebar-header">
          <RouterLink class="brand" to="/dashboard" @click="closeSidebar">
            <ShieldCheck :size="22" aria-hidden="true" />
            <span>SSO Admin</span>
          </RouterLink>
          <button
            class="sidebar-close"
            type="button"
            aria-label="Close menu"
            @click="closeSidebar"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </div>

        <nav class="nav-list">
          <RouterLink to="/dashboard" @click="closeSidebar"
            >Dashboard</RouterLink
          >
          <RouterLink to="/users" @click="closeSidebar">Users</RouterLink>
          <RouterLink to="/sessions" @click="closeSidebar">Sessions</RouterLink>
          <RouterLink to="/apps" @click="closeSidebar">Apps</RouterLink>
        </nav>

        <div class="sidebar-footer">
          <div class="principal">
            <strong>{{ admin.principal?.displayName }}</strong>
            <span>{{ admin.principal?.email }}</span>
          </div>
          <div class="sidebar-actions">
            <button
              class="icon-button"
              type="button"
              title="Refresh session"
              @click="admin.refreshSession"
            >
              <RefreshCw :size="18" aria-hidden="true" />
            </button>
            <a class="icon-button" title="Logout" href="/auth/logout">
              <LogOut :size="18" aria-hidden="true" />
            </a>
          </div>
        </div>
      </aside>
    </template>

    <main
      class="main-surface"
      :class="{ 'main-surface--auth': !showAdminShell }"
    >
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
