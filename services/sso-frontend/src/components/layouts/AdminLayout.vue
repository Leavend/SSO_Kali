<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { BarChart3, FileText, KeyRound, LogOut, ShieldCheck, Users } from 'lucide-vue-next'
import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import ThemeToggleButton from '@/components/atoms/ThemeToggleButton.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useAdminConsoleStore } from '@/stores/admin-console.store'

const admin = useAdminConsoleStore()
const route = useRoute()

const navItems = computed(() => [
  {
    to: '/admin/dashboard',
    label: 'Dashboard',
    icon: BarChart3,
    visible: admin.can('admin.dashboard.view'),
  },
  {
    to: '/admin/users',
    label: 'Users',
    icon: Users,
    visible: admin.can('admin.users.read') || admin.can('admin.users.write'),
  },
  {
    to: '/admin/clients',
    label: 'Clients',
    icon: KeyRound,
    visible: admin.can('admin.clients.read') || admin.can('admin.clients.write'),
  },
  { to: '/admin/audit', label: 'Audit', icon: FileText, visible: admin.can('admin.audit.read') },
])
const visibleNavItems = computed(() => navItems.value.filter((item) => item.visible))

onMounted((): void => {
  void admin.load()
})
</script>

<template>
  <div class="bg-background text-foreground min-h-screen">
    <a
      href="#admin-main"
      class="sr-only focus:not-sr-only focus:bg-primary focus:text-primary-foreground focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
    >
      Langsung ke konten admin
    </a>

    <header class="bg-background/90 sticky top-0 z-30 border-b backdrop-blur">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <RouterLink to="/admin/dashboard" class="flex items-center gap-2 font-semibold">
          <AppBrandMark />
          <span class="flex flex-col leading-none">
            <strong class="text-sm font-bold tracking-tight">Dev-SSO Admin</strong>
            <span class="text-muted-foreground text-[11px]">Governance Console</span>
          </span>
        </RouterLink>

        <nav
          class="hidden flex-1 items-center justify-center gap-1 md:flex"
          aria-label="Navigasi admin"
        >
          <RouterLink
            v-for="item in visibleNavItems"
            :key="item.to"
            :to="item.to"
            class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors"
            :class="route.path === item.to ? 'bg-muted text-foreground' : ''"
          >
            <component :is="item.icon" class="size-4" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <ThemeToggleButton />
          <a
            href="/auth/logout"
            class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium"
          >
            <LogOut class="size-4" aria-hidden="true" />
            Keluar
          </a>
        </div>
      </div>
    </header>

    <main
      id="admin-main"
      class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6"
      tabindex="-1"
    >
      <SsoAlertBanner v-if="admin.error" tone="error" :message="admin.error" />
      <section class="grid gap-2 rounded-xl border bg-muted/40 p-4" aria-label="Admin principal">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Admin aktif
            </p>
            <p class="font-semibold">
              {{ admin.principal?.display_name ?? 'Memuat konteks admin…' }}
            </p>
          </div>
          <p class="text-muted-foreground flex items-center gap-2 text-sm">
            <ShieldCheck class="size-4" aria-hidden="true" />
            {{ admin.principal?.role ?? 'admin' }}
          </p>
        </div>
      </section>

      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
