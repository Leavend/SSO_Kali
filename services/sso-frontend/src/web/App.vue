<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Activity, AppWindow, ChevronsLeft, ChevronsRight, LogOut, LayoutDashboard, Menu, RefreshCw, ShieldCheck, Users, X } from "lucide-vue-next";
import { RouterLink, RouterView, useRoute } from "vue-router";
import FloatingActions from "@/web/components/FloatingActions.vue";
import AuthFooter from "@/web/components/auth/AuthFooter.vue";
import ToastContainer from "@/web/components/ui/ToastContainer.vue";
import BottomNav from "@/web/components/layout/BottomNav.vue";
import CommandPalette from "@/web/components/layout/CommandPalette.vue";
import AdminHeader from "@/web/components/layout/AdminHeader.vue";
import { useAdminStore } from "./stores/admin";

const admin = useAdminStore();
const route = useRoute();
const sidebarOpen = ref(false);
const sidebarCollapsed = ref(false);
const showAdminShell = computed(() => Boolean(route.meta.requiresAuth) && admin.isAuthenticated);
let refreshTimer: number | undefined;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: Activity },
  { to: '/apps', label: 'Apps', icon: AppWindow },
] as const;

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

function handleSidebarKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeSidebar();
  }
}

watch(() => route.path, closeSidebar);
</script>

<template>
  <div
    data-testid="admin-app-shell"
    class="app-shell app-shell--responsive"
    :class="{
      'app-shell--auth': !showAdminShell,
      'app-shell--admin': showAdminShell,
      'app-shell--admin-collapsed': showAdminShell && sidebarCollapsed,
    }"
  >
    <!-- Toast notifications -->
    <ToastContainer />

    <!-- Command palette (desktop) -->
    <CommandPalette v-if="showAdminShell" />

    <template v-if="showAdminShell">
      <!-- Skip navigation link — WCAG 2.4.1 -->
      <a class="skip-link" href="#main-content">
        Langsung ke konten utama
      </a>

      <button
        class="hamburger-toggle"
        v-if="!sidebarOpen"
        type="button"
        aria-controls="admin-sidebar"
        aria-label="Buka menu navigasi"
        :aria-expanded="sidebarOpen"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Menu :size="20" aria-hidden="true" />
      </button>

      <Transition name="fade">
        <div
          v-if="sidebarOpen"
          class="sidebar-backdrop"
          aria-hidden="true"
          @click="closeSidebar"
        />
      </Transition>

      <aside
        id="admin-sidebar"
        class="sidebar"
        :class="{
          'sidebar--open': sidebarOpen,
          'sidebar--collapsed': sidebarCollapsed,
        }"
        role="navigation"
        aria-label="Navigasi admin panel"
        @keydown="handleSidebarKeydown"
      >
        <div class="sidebar-header">
          <RouterLink class="brand" to="/dashboard" @click="closeSidebar">
            <span class="brand-mark" aria-hidden="true">
              <ShieldCheck :size="20" />
            </span>
            <span class="brand-copy">
              <strong>SSO Admin</strong>
              <small>Enterprise Console</small>
            </span>
          </RouterLink>
          <button
            class="sidebar-collapse"
            type="button"
            :aria-label="sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'"
            :aria-pressed="sidebarCollapsed"
            :title="sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <ChevronsRight v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
            <ChevronsLeft v-else :size="18" aria-hidden="true" />
          </button>
          <button
            class="sidebar-close"
            type="button"
            aria-label="Tutup menu"
            @click="closeSidebar"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </div>

        <nav class="nav-list" aria-label="Menu utama">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :title="sidebarCollapsed ? item.label : undefined"
            @click="closeSidebar"
          >
            <span class="nav-icon">
              <component :is="item.icon" :size="18" aria-hidden="true" />
            </span>
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="sidebar-footer" role="contentinfo">
          <div class="principal">
            <strong>{{ admin.principal?.displayName }}</strong>
            <span>{{ admin.principal?.email }}</span>
          </div>
          <div class="sidebar-actions">
            <button
              class="icon-button"
              type="button"
              :title="`Refresh sesi — berakhir ${new Date((admin.principal?.expiresAt ?? 0) * 1000).toLocaleTimeString('id-ID')}`"
              aria-label="Refresh sesi admin"
              @click="admin.refreshSession"
            >
              <RefreshCw :size="18" aria-hidden="true" />
            </button>
            <a
              class="icon-button"
              title="Keluar dari admin panel"
              aria-label="Keluar"
              href="/auth/logout"
            >
              <LogOut :size="18" aria-hidden="true" />
            </a>
          </div>
        </div>
      </aside>

      <div data-testid="admin-content-shell" class="admin-content-shell admin-content-shell--responsive">
        <AdminHeader />
        <main id="main-content" data-testid="admin-main-surface" class="main-surface main-surface--responsive" role="main">
          <RouterView v-slot="{ Component }">
            <Transition name="page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </main>

        <AuthFooter class="admin-auth-footer" />
        <FloatingActions admin />
        <BottomNav />
      </div>
    </template>

    <main v-else id="main-content" class="main-surface main-surface--auth" role="main">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
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

.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
