<script setup lang="ts">
/**
 * PortalHeader — organism: brand + navigation + theme + user menu.
 *
 * Mobile: hamburger menu with slide-out nav.
 * Desktop (md+): inline horizontal nav.
 */

import { ref } from 'vue'
import {
  Activity,
  AppWindow,
  Home,
  Menu,
  ScrollText,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import LocaleSwitcher from '@/components/atoms/LocaleSwitcher.vue'
import ThemeToggleButton from '@/components/atoms/ThemeToggleButton.vue'
import PortalNavLink from '@/components/molecules/PortalNavLink.vue'
import PortalUserMenu from '@/components/molecules/PortalUserMenu.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const navItems = [
  { to: '/home', labelKey: 'portal.nav.home', icon: Home },
  { to: '/profile', labelKey: 'portal.nav.profile', icon: UserRound },
  { to: '/apps', labelKey: 'portal.nav.apps', icon: AppWindow },
  {
    to: '/sessions',
    labelKey: 'portal.nav.sessions',
    shortLabelKey: 'portal.nav.sessions_short',
    icon: Activity,
  },
  { to: '/security', labelKey: 'portal.nav.security', icon: ShieldCheck },
  { to: '/privacy', labelKey: 'portal.nav.privacy', icon: ScrollText },
]

const mobileMenuOpen = ref<boolean>(false)

function toggleMenu(): void {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

function closeMenu(): void {
  mobileMenuOpen.value = false
}
</script>

<template>
  <header
    data-testid="portal-header"
    class="portal-header-glass fixed inset-x-0 top-0 z-30 border-b border-[var(--glass-border-subtle)] bg-white/70 shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-md)] supports-[backdrop-filter]:bg-white/55 dark:bg-[var(--glass-bg-primary)]/70 dark:supports-[backdrop-filter]:bg-[var(--glass-bg-primary)]/55"
  >
    <div
      data-testid="portal-header-row"
      class="mx-auto flex h-14 max-w-6xl min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:gap-4"
    >
      <RouterLink
        data-testid="portal-header-brand"
        to="/home"
        class="group flex min-w-0 items-center gap-2 rounded-full px-1.5 py-1 pr-3 font-semibold transition-colors hover:bg-white/40 dark:hover:bg-white/10"
      >
        <AppBrandMark />
        <span class="flex flex-col leading-none">
          <strong class="text-sm font-bold tracking-tight text-[var(--text-primary)]"
            >Dev-SSO</strong
          >
          <span class="text-[11px] text-[var(--text-secondary)]">{{ t('portal.brand') }}</span>
        </span>
      </RouterLink>

      <!-- Desktop nav -->
      <nav
        data-testid="portal-desktop-nav"
        class="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden md:flex"
        :aria-label="t('portal.brand')"
      >
        <PortalNavLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :label="t(item.labelKey)"
          :short-label="item.shortLabelKey ? t(item.shortLabelKey) : undefined"
          :icon="item.icon"
        />
      </nav>

      <div data-testid="portal-header-actions" class="ml-auto flex shrink-0 items-center gap-1.5">
        <LocaleSwitcher />
        <ThemeToggleButton />
        <PortalUserMenu compact />
        <!-- Mobile hamburger -->
        <button
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] bg-white/20 text-[var(--text-secondary)] shadow-[var(--shadow-glass-sm)] transition-colors hover:bg-white/35 hover:text-[var(--text-primary)] md:hidden dark:bg-white/10 dark:hover:bg-white/15"
          :aria-label="mobileMenuOpen ? t('portal.header.close_menu') : t('portal.header.open_menu')"
          :aria-expanded="mobileMenuOpen"
          @click="toggleMenu"
        >
          <X v-if="mobileMenuOpen" class="size-5" aria-hidden="true" />
          <Menu v-else class="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Mobile nav drawer -->
    <Transition name="mobile-nav">
      <nav
        v-if="mobileMenuOpen"
        class="border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] px-4 pb-4 pt-2 shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-md)] md:hidden"
        :aria-label="t('portal.brand')"
      >
        <div class="grid gap-1">
          <PortalNavLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :label="t(item.labelKey)"
            :short-label="item.shortLabelKey ? t(item.shortLabelKey) : undefined"
            :icon="item.icon"
            @click="closeMenu"
          />
        </div>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.mobile-nav-enter-active,
.mobile-nav-leave-active {
  transition: all 200ms ease;
  transform-origin: top;
}
.mobile-nav-enter-from,
.mobile-nav-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
