<script setup lang="ts">
import { CircleDot, ShieldCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import { useI18n } from '@/composables/useI18n'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'

const session = useSessionStore()
const { t } = useI18n()

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
    <a class="skip-link" href="#admin-main">{{ t('admin.skip_link') }}</a>
    <aside class="admin-sidebar" :aria-label="t('admin.sidebar_label')">
      <div class="admin-brand">
        <span class="eyebrow"
          ><ShieldCheck :size="16" aria-hidden="true" />{{ t('admin.brand_eyebrow') }}</span
        >
        <strong>{{ t('admin.brand_title') }}</strong>
      </div>
      <LocaleSwitcher />

      <nav class="admin-nav" :aria-label="t('admin.module_label')">
        <RouterLink
          v-for="menu in visibleMenus"
          :key="menu.id"
          class="admin-nav__link"
          active-class="admin-nav__link--active"
          :to="menuPath(menu)"
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
        <span>{{ session.principal.email }}</span>
      </section>
    </aside>

    <main id="admin-main" class="admin-content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
