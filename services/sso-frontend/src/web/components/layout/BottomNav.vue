<script setup lang="ts">
import { useRoute } from 'vue-router'
import { LayoutDashboard, Users, Activity, AppWindow } from 'lucide-vue-next'

const route = useRoute()

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: Activity },
  { to: '/apps', label: 'Apps', icon: AppWindow },
] as const

function isActive(to: string): boolean {
  if (to === '/dashboard') {
    return route.path === '/dashboard'
  }
  return route.path.startsWith(to)
}
</script>

<template>
  <nav class="bottom-nav" aria-label="Main navigation">
    <RouterLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': isActive(item.to) }"
      :aria-current="isActive(item.to) ? 'page' : undefined"
    >
      <component :is="item.icon" :size="22" class="bottom-nav__icon" aria-hidden="true" />
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: none;
  padding: var(--space-2);
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
  background: var(--admin-panel);
  border-top: 1px solid var(--admin-line);
}

@media (max-width: 768px) {
  .bottom-nav {
    display: flex;
  }
}

.bottom-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: var(--space-1);
  min-height: 56px;
  padding: var(--space-2);
  color: var(--admin-muted);
  text-decoration: none;
  transition: color var(--duration-fast) ease;
}

.bottom-nav__item:hover {
  color: var(--admin-ink);
}

.bottom-nav__item--active {
  color: var(--admin-accent);
}

.bottom-nav__icon {
  transition: transform var(--duration-fast) ease;
}

.bottom-nav__item--active .bottom-nav__icon {
  transform: scale(1.1);
}

.bottom-nav__label {
  font-size: 11px;
  font-weight: 600;
}
</style>
