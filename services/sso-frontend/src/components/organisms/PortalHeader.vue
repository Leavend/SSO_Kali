<script setup lang="ts">
/**
 * PortalHeader — organism: brand + navigation + theme + user menu.
 *
 * Mobile: hamburger menu with slide-out nav.
 * Desktop (md+): inline horizontal nav.
 */

import { ref } from 'vue'
import { Activity, AppWindow, Home, Menu, ScrollText, ShieldCheck, UserRound, X } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import AppBrandMark from '@/components/atoms/AppBrandMark.vue'
import ThemeToggleButton from '@/components/atoms/ThemeToggleButton.vue'
import PortalNavLink from '@/components/molecules/PortalNavLink.vue'
import PortalUserMenu from '@/components/molecules/PortalUserMenu.vue'

const navItems = [
  { to: '/home', label: 'Beranda', icon: Home },
  { to: '/profile', label: 'Profil', icon: UserRound },
  { to: '/apps', label: 'Aplikasi', icon: AppWindow },
  { to: '/sessions', label: 'Sesi Aktif', icon: Activity },
  { to: '/security', label: 'Keamanan', icon: ShieldCheck },
  { to: '/privacy', label: 'Privasi', icon: ScrollText },
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
    class="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 border-b backdrop-blur"
  >
    <div data-testid="portal-header-row" class="mx-auto flex h-16 max-w-6xl min-w-0 items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:gap-4">
      <RouterLink data-testid="portal-header-brand" to="/home" class="flex min-w-0 items-center gap-2 font-semibold">
        <AppBrandMark />
        <span class="flex flex-col leading-none">
          <strong class="text-sm font-bold tracking-tight">Dev-SSO</strong>
          <span class="text-muted-foreground text-[11px]">Portal Pengguna</span>
        </span>
      </RouterLink>

      <!-- Desktop nav -->
      <nav
        data-testid="portal-desktop-nav"
        class="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden md:flex"
        aria-label="Navigasi portal"
      >
        <PortalNavLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :label="item.label"
          :icon="item.icon"
        />
      </nav>

      <div data-testid="portal-header-actions" class="ml-auto flex shrink-0 items-center gap-1.5">
        <ThemeToggleButton />
        <PortalUserMenu />
        <!-- Mobile hamburger -->
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground inline-flex size-11 items-center justify-center rounded-md transition-colors md:hidden"
          :aria-label="mobileMenuOpen ? 'Tutup menu' : 'Buka menu'"
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
        class="bg-background border-b px-4 pb-4 pt-2 md:hidden"
        aria-label="Navigasi portal mobile"
      >
        <div class="grid gap-1">
          <PortalNavLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :label="item.label"
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

