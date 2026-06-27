<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'

const session = useSessionStore()

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

// menu-id → named route map (mirrors the previous path mapping incl. audit→observability remap)
const MENU_ROUTE_MAP: Readonly<Record<string, string>> = {
  dashboard: 'admin.dashboard',
  'oidc-foundation': 'admin.oidc-foundation',
  audit: 'admin.observability', // remap: legacy audit id → admin.observability page
  users: 'admin.users',
  clients: 'admin.clients',
  roles: 'admin.roles',
  sessions: 'admin.sessions',
  policy: 'admin.policy',
  'external-idps': 'admin.external-idps',
  ops: 'admin.ops',
  'ip-access': 'admin.ip-access',
  profile: 'admin.profile',
  'sso-error-templates': 'admin.sso-error-templates',
  'authentication-audit': 'admin.authentication-audit',
}

function menuRoute(menu: AdminPermissionMenu): { name: string } | string {
  const name = MENU_ROUTE_MAP[menu.id]
  // Fallback to path string for any menu item not yet in the route map
  return name ? { name } : `/${menu.id}`
}
</script>

<template>
  <div class="admin-shell" data-admin-shell>
    <aside class="admin-shell__sidebar" aria-label="Admin navigation">
      <p class="admin-shell__brand">SSO Control Plane</p>
      <nav class="admin-shell__nav" aria-label="Admin modules">
        <NuxtLink
          v-for="menu in visibleMenus"
          :key="menu.id"
          class="admin-shell__nav-link"
          :data-menu-id="menu.id"
          :to="menuRoute(menu)"
        >
          {{ menu.label }}
        </NuxtLink>
      </nav>
      <!-- Same-origin BFF logout: revokes tokens + clears the session cookie.
           Must stay same-origin — pointing elsewhere leaves this BFF session intact. -->
      <a class="admin-logout" href="/auth/logout">Sign out</a>
    </aside>

    <div class="admin-main-column">
      <header class="admin-shell__topbar" data-testid="admin-topbar">
        <p class="admin-shell__topbar-brand">Admin</p>
        <div class="admin-shell__topbar-actions">
          <!-- The credentialed account widget is browser-only; wired in Task 2a.8. -->
          <ClientOnly>
            <SsoAccountBar v-if="session.principal" />
          </ClientOnly>
        </div>
      </header>

      <main id="admin-main" class="admin-shell__main" tabindex="-1">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w, 264px) 1fr;
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
}

.admin-shell__sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-right: 1px solid var(--border, #e5e5e7);
  background: var(--bg-2);
}

.admin-shell__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.admin-shell__nav-link {
  padding: 8px 10px;
  color: inherit;
  text-decoration: none;
  border-radius: var(--r-md, 2px);
  border-left: 2px solid transparent; /* reserves space — prevents layout shift on active */
}

.admin-shell__nav-link.router-link-active,
.admin-shell__nav-link.router-link-exact-active {
  background: var(--bg);
  font-weight: 600;
  border-left-color: var(--accent);
  color: var(--accent);
}

.admin-logout {
  margin-top: auto;
  padding: 8px 10px;
  color: inherit;
}

.admin-main-column {
  display: grid;
  grid-template-rows: var(--topbar-h, 64px) 1fr;
}

.admin-shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--border, #e5e5e7);
  background: var(--card);
}

.admin-shell__topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.admin-shell__main {
  padding: var(--content-pad, 24px);
}
</style>
