<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, Bell } from 'lucide-vue-next'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useAdminStore } from '@/stores/admin'

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
      <!-- Notification bell -->
      <button
        type="button"
        class="admin-header__action"
        aria-label="Notifications"
      >
        <Bell :size="18" aria-hidden="true" />
      </button>

      <!-- Theme toggle -->
      <ThemeToggle />

      <!-- User menu placeholder -->
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
  padding: 0 var(--space-6);
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
  gap: var(--space-2);
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

/* Action buttons */
.admin-header__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.admin-header__action:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
  border-color: var(--admin-line);
}

/* User avatar */
.admin-header__user {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: var(--space-2);
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
</style>
