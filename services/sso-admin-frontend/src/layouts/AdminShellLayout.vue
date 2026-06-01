<script setup lang="ts">
import { CircleDot, LogOut, Menu, PanelLeftClose, ShieldCheck } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'

const session = useSessionStore()
const { t } = useI18n()
const env = getAdminEnvironment()
const isNavOpen = ref(false)

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

function menuPath(menu: AdminPermissionMenu): string {
  if (menu.id === 'dashboard') return '/dashboard'
  if (menu.id === 'oidc-foundation') return '/oidc-foundation'

  return `/${menu.id}`
}

const logoutHref = computed<string>(() => new URL('/logout', env.ssoBaseUrl).toString())

function closeNav(): void {
  isNavOpen.value = false
}
</script>

<template>
  <div class="admin-control-plane" :class="{ 'admin-control-plane--nav-open': isNavOpen }">
    <a class="skip-link" href="#admin-main">{{ t('admin.skip_link') }}</a>
    <aside class="admin-sidebar" :aria-label="t('admin.sidebar_label')">
      <div class="admin-sidebar__header">
        <div class="admin-brand">
          <span class="eyebrow"
            ><ShieldCheck :size="16" aria-hidden="true" />{{ t('admin.brand_eyebrow') }}</span
          >
          <strong>{{ t('admin.brand_title') }}</strong>
        </div>
        <button
          class="admin-sidebar__close"
          type="button"
          :aria-label="t('admin.close_navigation')"
          @click="closeNav"
        >
          <PanelLeftClose :size="18" aria-hidden="true" />
        </button>
      </div>
      <LocaleSwitcher />

      <nav class="admin-nav" :aria-label="t('admin.module_label')">
        <RouterLink
          v-for="menu in visibleMenus"
          :key="menu.id"
          class="admin-nav__link"
          active-class="admin-nav__link--active"
          :to="menuPath(menu)"
          @click="closeNav"
        >
          <span class="admin-nav__label"
            ><CircleDot :size="14" aria-hidden="true" />{{ menu.label }}</span
          >
          <small>{{ menu.required_permission }}</small>
        </RouterLink>
      </nav>

      <section
        v-if="session.principal"
        class="admin-principal"
        :aria-label="t('admin.principal_label')"
      >
        <strong>{{ session.principal.display_name }}</strong>
        <small class="admin-principal__role">{{ session.principal.role }}</small>
        <span>{{ session.principal.email }}</span>
      </section>
    </aside>

    <div class="admin-main-column">
      <header data-testid="admin-topbar" class="admin-topbar">
        <div class="admin-topbar__title">
          <button
            data-testid="admin-mobile-menu-toggle"
            class="admin-mobile-toggle"
            type="button"
            :aria-label="t('admin.open_navigation')"
            :aria-expanded="isNavOpen"
            @click="isNavOpen = !isNavOpen"
          >
            <Menu :size="18" aria-hidden="true" />
          </button>
          <nav class="admin-breadcrumb" :aria-label="t('admin.breadcrumb_label')">
            <ol>
              <li>{{ t('admin.brand_eyebrow') }}</li>
              <li aria-hidden="true">/</li>
              <li>{{ t('admin.brand_title') }}</li>
            </ol>
          </nav>
        </div>
        <div class="admin-topbar__actions">
          <UiThemeToggle />
          <a data-testid="admin-logout-action" class="admin-logout" :href="logoutHref">
            <LogOut :size="16" aria-hidden="true" />{{ t('admin.logout') }}
          </a>
        </div>
      </header>

      <main id="admin-main" class="admin-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
