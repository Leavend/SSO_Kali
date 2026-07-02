<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'
import { useI18n } from '@/composables/useI18n'
// Explicit imports (repo convention): auto-import registration does not survive
// fixture-layer builds (test/fixtures/e2e, ssr-leak), which resolve the root
// config's ~/components against the fixture srcDir.
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import SsoAccountBar from '@/components/SsoAccountBar.vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import {
  LayoutDashboard,
  User,
  Users,
  Shield,
  FileText,
  Lock,
  History,
  Activity,
  ClipboardList,
  Layers,
  Laptop,
  Globe,
  FileWarning,
  Settings2,
  Menu as MenuIcon,
  X,
  LogOut,
  ChevronRight
} from 'lucide-vue-next'

const session = useSessionStore()
const { t } = useI18n()

const isMobileSidebarOpen = ref(false)

const MENU_ROUTE_MAP: Readonly<Record<string, string>> = {
  dashboard: 'admin.dashboard',
  'oidc-foundation': 'admin.oidc-foundation',
  audit: 'admin.observability',
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

const MENU_ICONS: Record<string, any> = {
  dashboard: LayoutDashboard,
  profile: User,
  users: Users,
  roles: Shield,
  policy: FileText,
  'ip-access': Lock,
  sessions: History,
  audit: Activity,
  'authentication-audit': ClipboardList,
  'oidc-foundation': Layers,
  clients: Laptop,
  'external-idps': Globe,
  'sso-error-templates': FileWarning,
  ops: Settings2,
}

const MENU_GROUPS: Record<string, string> = {
  dashboard: 'utama',
  profile: 'utama',
  users: 'keamanan',
  roles: 'keamanan',
  policy: 'keamanan',
  'ip-access': 'keamanan',
  sessions: 'keamanan',
  audit: 'observabilitas',
  'authentication-audit': 'observabilitas',
  'oidc-foundation': 'lainnya',
  clients: 'lainnya',
  'external-idps': 'lainnya',
  'sso-error-templates': 'lainnya',
  ops: 'lainnya'
}

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

const groupedMenus = computed(() => {
  const groups: Record<string, AdminPermissionMenu[]> = {
    utama: [],
    keamanan: [],
    observabilitas: [],
    lainnya: []
  }
  for (const menu of visibleMenus.value) {
    const groupKey = MENU_GROUPS[menu.id] || 'lainnya'
    groups[groupKey]!.push(menu)
  }
  return Object.entries(groups).filter(([_, items]) => items.length > 0)
})

function menuRoute(menu: AdminPermissionMenu): { name: string } | string {
  const name = MENU_ROUTE_MAP[menu.id]
  return name ? { name } : `/${menu.id}`
}

function getMenuIcon(menuId: string) {
  return MENU_ICONS[menuId] || FileText
}

function toggleMobileSidebar() {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}

function closeMobileSidebar() {
  isMobileSidebarOpen.value = false
}
</script>

<template>
  <div class="admin-shell" data-admin-shell>
    <!-- Overlay for mobile drawer -->
    <div
      v-if="isMobileSidebarOpen"
      class="admin-shell__sidebar-overlay"
      @click="closeMobileSidebar"
    />

    <aside
      class="admin-shell__sidebar"
      :class="{ 'admin-shell__sidebar--open': isMobileSidebarOpen }"
      aria-label="Admin navigation"
    >
      <div class="admin-shell__brand-container">
        <span class="admin-shell__brand-logo">
          <Layers :size="20" class="text-white" />
        </span>
        <div>
          <h2 class="admin-shell__brand-title">SSO Console</h2>
          <span class="admin-shell__brand-subtitle">Control Plane</span>
        </div>
        <button class="admin-shell__sidebar-close" @click="closeMobileSidebar" aria-label="Close menu">
          <X :size="18" />
        </button>
      </div>

      <nav class="admin-shell__nav" aria-label="Admin modules">
        <div v-for="[groupKey, items] in groupedMenus" :key="groupKey" class="admin-shell__nav-group">
          <span class="admin-shell__nav-group-title">
            {{ t('menu_group.' + groupKey) }}
          </span>
          <div class="admin-shell__nav-items">
            <NuxtLink
              v-for="menu in items"
              :key="menu.id"
              class="admin-shell__nav-link"
              :data-menu-id="menu.id"
              :to="menuRoute(menu)"
              @click="closeMobileSidebar"
            >
              <component :is="getMenuIcon(menu.id)" :size="18" class="admin-shell__nav-icon" />
              <span class="admin-shell__nav-label">{{ menu.label }}</span>
              <ChevronRight :size="14" class="admin-shell__nav-arrow" />
            </NuxtLink>
          </div>
        </div>
      </nav>

      <!-- Sidebar footer / user session info -->
      <div class="admin-shell__sidebar-footer">
        <div v-if="session.principal" class="admin-shell__profile-card">
          <div class="admin-shell__profile-avatar">
            {{ session.principal.display_name?.charAt(0).toUpperCase() || 'A' }}
          </div>
          <div class="admin-shell__profile-info">
            <p class="admin-shell__profile-name">{{ session.principal.display_name }}</p>
            <p class="admin-shell__profile-role">{{ session.principal.role }}</p>
          </div>
        </div>
        <a class="admin-logout" href="/auth/logout">
          <LogOut :size="16" />
          <span>Sign out</span>
        </a>
      </div>
    </aside>

    <div class="admin-main-column">
      <header class="admin-shell__topbar" data-testid="admin-topbar">
        <div class="admin-shell__topbar-left">
          <button class="admin-sidebar-toggle" @click="toggleMobileSidebar" aria-label="Toggle navigation menu">
            <MenuIcon :size="20" />
          </button>
          <span class="admin-shell__topbar-brand">Admin Console</span>
        </div>
        
        <div class="admin-shell__topbar-actions">
          <LocaleSwitcher />
          <UiThemeToggle />
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

.admin-shell__sidebar-overlay {
  display: none;
}

.admin-shell__sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  border-right: 1px solid var(--border);
  background: var(--card);
  padding: 20px 16px;
  z-index: 1000;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.admin-shell__brand-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 4px 8px;
}

.admin-shell__brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  background: linear-gradient(135deg, var(--accent), var(--accent-600));
  box-shadow: var(--shadow-sm);
}

.admin-shell__brand-title {
  margin: 0;
  font: 700 0.95rem/1.2 var(--font-sans);
  letter-spacing: -0.015em;
  color: var(--fg);
}

.admin-shell__brand-subtitle {
  font: 500 0.7rem/1 var(--font-sans);
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.admin-shell__sidebar-close {
  display: none;
}

.admin-shell__nav {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.admin-shell__nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-shell__nav-group-title {
  font: 700 0.65rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
  padding-left: 10px;
  margin-bottom: 4px;
}

.admin-shell__nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin-shell__nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: var(--fg-2);
  text-decoration: none;
  border-radius: var(--r-sm);
  transition: all 0.2s ease;
  font: 500 0.8125rem/1 var(--font-sans);
}

.admin-shell__nav-icon {
  flex-shrink: 0;
  color: var(--fg-3);
  transition: color 0.2s ease;
}

.admin-shell__nav-arrow {
  margin-left: auto;
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
  color: var(--accent);
}

.admin-shell__nav-link:hover {
  background: var(--muted);
  color: var(--fg);
}

.admin-shell__nav-link:hover .admin-shell__nav-icon {
  color: var(--fg);
}

.admin-shell__nav-link:hover .admin-shell__nav-arrow {
  opacity: 0.5;
  transform: translateX(0);
}

.admin-shell__nav-link.router-link-active,
.admin-shell__nav-link.router-link-exact-active {
  background: var(--accent-soft);
  color: var(--accent-soft-fg);
  font-weight: 600;
}

.admin-shell__nav-link.router-link-active .admin-shell__nav-icon,
.admin-shell__nav-link.router-link-exact-active .admin-shell__nav-icon {
  color: var(--accent);
}

.admin-shell__nav-link.router-link-active .admin-shell__nav-arrow,
.admin-shell__nav-link.router-link-exact-active .admin-shell__nav-arrow {
  opacity: 1;
  transform: translateX(0);
}

.admin-shell__sidebar-footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-shell__profile-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-2);
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
}

.admin-shell__profile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-full);
  background: var(--accent);
  color: var(--accent-fg);
  font: 700 0.85rem/1 var(--font-sans);
}

.admin-shell__profile-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-shell__profile-name {
  margin: 0;
  font: 600 0.775rem/1.2 var(--font-sans);
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-shell__profile-role {
  margin: 0;
  font: 500 0.65rem/1 var(--font-sans);
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.admin-logout {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: var(--danger);
  border-radius: var(--r-sm);
  transition: all 0.2s ease;
  font: 600 0.8125rem/1 var(--font-sans);
  cursor: pointer;
}

.admin-logout:hover {
  background: var(--danger-soft);
  color: var(--danger-soft-fg);
}

.admin-main-column {
  display: grid;
  grid-template-rows: var(--topbar-h, 64px) 1fr;
  min-width: 0;
}

.admin-shell__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--content-pad, 32px);
  border-bottom: 1px solid var(--border);
  background: var(--card);
  position: sticky;
  top: 0;
  z-index: 900;
}

.admin-shell__topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-sidebar-toggle {
  display: none;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg-2);
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  place-items: center;
  cursor: pointer;
}

.admin-sidebar-toggle:hover {
  background: var(--muted);
  color: var(--fg);
}

.admin-shell__topbar-brand {
  font: 600 0.95rem/1.2 var(--font-sans);
  color: var(--fg);
}

.admin-shell__topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-shell__main {
  padding: var(--content-pad, 32px);
  background: var(--bg);
  min-height: calc(100vh - var(--topbar-h, 64px));
}

/* Responsive Media Queries */
@media (max-width: 1024px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .admin-shell__sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(4px);
  }

  .admin-shell__sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--sidebar-w, 264px);
    transform: translateX(-100%);
    z-index: 1000;
    box-shadow: var(--shadow-lg);
  }

  .admin-shell__sidebar--open {
    transform: translateX(0);
  }

  .admin-shell__sidebar-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg-2);
    margin-left: auto;
    cursor: pointer;
  }

  .admin-shell__sidebar-close:hover {
    background: var(--muted);
    color: var(--fg);
  }

  .admin-sidebar-toggle {
    display: inline-grid;
  }
}
</style>
