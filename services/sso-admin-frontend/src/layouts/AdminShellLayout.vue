<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'

const session = useSessionStore()

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

function menuPath(menu: AdminPermissionMenu): string {
  if (menu.id === 'dashboard') return '/dashboard'
  if (menu.id === 'oidc-foundation') return '/oidc-foundation'

  return `/${menu.id}`
}
</script>

<template>
  <div class="admin-control-plane">
    <a class="skip-link" href="#admin-main">Lewati ke konten utama</a>
    <aside class="admin-sidebar" aria-label="Navigasi admin">
      <div class="admin-brand">
        <span class="eyebrow">SSO Admin</span>
        <strong>Control Plane</strong>
      </div>

      <nav class="admin-nav" aria-label="Modul admin">
        <RouterLink
          v-for="menu in visibleMenus"
          :key="menu.id"
          class="admin-nav__link"
          active-class="admin-nav__link--active"
          :to="menuPath(menu)"
        >
          <span>{{ menu.label }}</span>
          <small>{{ menu.required_permission }}</small>
        </RouterLink>
      </nav>

      <section v-if="session.principal" class="admin-principal" aria-label="Principal admin aktif">
        <strong>{{ session.principal.display_name }}</strong>
        <span>{{ session.principal.email }}</span>
      </section>
    </aside>

    <main id="admin-main" class="admin-content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
