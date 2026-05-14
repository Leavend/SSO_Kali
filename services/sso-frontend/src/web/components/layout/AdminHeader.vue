<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import ThemeToggle from '@/web/components/ThemeToggle.vue'
import { useAdminStore } from '@/web/stores/admin'

const route = useRoute()
const admin = useAdminStore()

const breadcrumbs = computed(() => {
  const crumbs = [{ label: 'Home', to: '/dashboard' }]

  const routeNames: Record<string, string> = {
    dashboard: 'Dashboard',
    users: 'Users',
    'user-detail': 'User Detail',
    sessions: 'Sessions',
    apps: 'Applications',
    terms: 'Terms',
    privacy: 'Privacy',
    docs: 'Documentation',
  }

  if (route.name && routeNames[String(route.name)]) {
    if (route.params.id) {
      crumbs.push({
        label: routeNames[String(route.name)],
        to: `/${String(route.name).replace('-detail', 's')}`,
      })
      crumbs.push({ label: `ID: ${route.params.id}`, to: '' })
    } else {
      crumbs.push({ label: routeNames[String(route.name)], to: '' })
    }
  }

  return crumbs
})

const avatarLabel = computed(() => {
  const name = admin.principal?.displayName ?? admin.principal?.email ?? 'A'
  return name.trim().charAt(0).toUpperCase() || 'A'
})
</script>

<template>
  <header class="admin-header">
    <div class="admin-header__left">
      <!-- Breadcrumbs -->
      <nav class="admin-header__breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li v-for="(crumb, index) in breadcrumbs" :key="index">
            <RouterLink v-if="crumb.to" :to="crumb.to">
              {{ crumb.label }}
            </RouterLink>
            <span v-else>{{ crumb.label }}</span>
            <ChevronRight
              v-if="index < breadcrumbs.length - 1"
              :size="14"
              class="admin-header__separator"
              aria-hidden="true"
            />
          </li>
        </ol>
      </nav>
    </div>

    <div class="admin-header__right">
      <ThemeToggle :system-preference="true" />

      <div class="admin-header__user">
        <span class="admin-header__avatar" aria-hidden="true">{{ avatarLabel }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.admin-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  height: 56px;
  padding: 0 var(--space-8);
  background: var(--admin-panel);
  border-bottom: 1px solid var(--admin-line);
  flex-shrink: 0;
}

.admin-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.admin-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* Theme toggle — admin context override */
.admin-header__right :deep(.theme-toggle) {
  width: 36px;
  height: 36px;
  color: var(--admin-muted);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  box-shadow: none;
}

.admin-header__right :deep(.theme-toggle:hover) {
  color: var(--admin-ink);
  background: color-mix(in srgb, var(--admin-panel-muted) 80%, var(--admin-accent-soft));
  border-color: var(--admin-accent);
  transform: none;
}

.admin-header__right :deep(.theme-toggle:focus-visible) {
  outline: 2px solid var(--admin-accent);
  outline-offset: 2px;
  box-shadow: none;
}

/* Breadcrumbs */
.admin-header__breadcrumbs ol {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin-header__breadcrumbs li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.admin-header__breadcrumbs a {
  color: var(--admin-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  transition: color var(--duration-fast) ease;
}

.admin-header__breadcrumbs a:hover {
  color: var(--admin-accent);
}

.admin-header__breadcrumbs li:last-child span {
  color: var(--admin-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}

.admin-header__separator {
  color: var(--admin-subtle);
}

/* User avatar */
.admin-header__user {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-header__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--admin-accent-ink);
  background: var(--admin-accent);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 768px) {
  .admin-header {
    padding: 0 var(--space-4);
  }

  .admin-header__breadcrumbs {
    display: none;
  }
}

@media (min-width: 1024px) {
  .admin-header {
    padding: 0 var(--space-10);
  }
}

@media (min-width: 1280px) {
  .admin-header {
    padding: 0 var(--space-12);
  }
}

@media (min-width: 1440px) {
  .admin-header {
    padding: 0 var(--space-14);
  }
}
</style>
