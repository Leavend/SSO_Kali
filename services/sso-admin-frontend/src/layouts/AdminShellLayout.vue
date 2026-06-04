<script setup lang="ts">
import {
  LayoutDashboard,
  Layers,
  AppWindow,
  Users,
  History,
  Activity,
  ShieldCheck,
  Fingerprint,
  FileSearch,
  User,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CircleDot,
  X,
  Menu,
} from 'lucide-vue-next'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'

const session = useSessionStore()
const { t, locale } = useI18n()
const env = getAdminEnvironment()
const isNavOpen = ref(false)

const route = useRoute()
const router = useRouter()
const currentIndex = ref(0)
const isAnimating = ref(false)
const navRef = ref<HTMLElement | null>(null)
const pillStyle = ref({ top: '0px', height: '0px', opacity: '0' })

const isTest = import.meta.env.MODE === 'test'

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

function translateMenuLabel(menu: AdminPermissionMenu): string {
  const translationKey = `menu.${menu.id}`
  const translated = t(translationKey)
  return translated === translationKey ? menu.label : translated
}

const activeMenuLabel = computed<string>(() => {
  const currentMenu = visibleMenus.value[currentIndex.value]
  return currentMenu ? translateMenuLabel(currentMenu) : ''
})

watch(
  [() => route?.path, locale],
  () => {
    if (activeMenuLabel.value) {
      document.title = `${activeMenuLabel.value} | ${t('admin.brand_eyebrow')}`
    } else {
      document.title = `${t('admin.brand_title')} | ${t('admin.brand_eyebrow')}`
    }
  },
  { immediate: true },
)

const menuIcons: Record<string, any> = {
  dashboard: LayoutDashboard,
  'oidc-foundation': Layers,
  clients: AppWindow,
  users: Users,
  audit: History,
  sessions: Activity,
  policy: ShieldCheck,
  roles: Fingerprint,
  'authentication-audit': FileSearch,
  profile: User,
}

function menuPath(menu: AdminPermissionMenu): string {
  if (menu.id === 'dashboard') return '/dashboard'
  if (menu.id === 'oidc-foundation') return '/oidc-foundation'

  return `/${menu.id}`
}

const logoutHref = computed<string>(() => new URL('/logout', env.ssoBaseUrl).toString())

function closeNav(): void {
  isNavOpen.value = false
}

const isCollapsed = ref(false)
const isMobile = ref(false)
function checkMobile() {
  isMobile.value = window.innerWidth <= 760
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  const saved = localStorage.getItem('sso-sidebar-collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
    setTimeout(updatePillPosition, 150)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

function handleToggle(): void {
  if (isMobile.value) {
    isNavOpen.value = !isNavOpen.value
  } else {
    isCollapsed.value = !isCollapsed.value
    localStorage.setItem('sso-sidebar-collapsed', String(isCollapsed.value))
    setTimeout(updatePillPosition, 260)
  }
}

function getMenuIndexByPath(path: string): number {
  return visibleMenus.value.findIndex((menu) => menuPath(menu) === path)
}

function updatePillPosition() {
  if (!navRef.value) return
  // Find child link element corresponding to currentIndex.
  // Note: the pill div is the first child (index 0), so links start at child index 1.
  const activeLink = navRef.value.children[currentIndex.value + 1] as HTMLElement
  if (activeLink) {
    pillStyle.value = {
      top: `${activeLink.offsetTop}px`,
      height: `${activeLink.offsetHeight}px`,
      opacity: '1',
    }
  }
}

watch(
  () => route?.path,
  (newPath) => {
    if (newPath && !isAnimating.value) {
      const idx = getMenuIndexByPath(newPath)
      if (idx !== -1) {
        currentIndex.value = idx
      }
    }
  },
  { immediate: true },
)

watch(currentIndex, () => {
  updatePillPosition()
})

let resizeHandler: (() => void) | null = null

onMounted(() => {
  setTimeout(updatePillPosition, 100)
  resizeHandler = () => updatePillPosition()
  window.addEventListener('resize', resizeHandler)
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
  }
})

async function handleMenuClick(menu: AdminPermissionMenu, index: number) {
  closeNav()
  if (index === currentIndex.value || isAnimating.value) return

  if (isTest) {
    currentIndex.value = index
    if (router) {
      await router.push(menuPath(menu))
    }
    return
  }

  isAnimating.value = true
  const targetIndex = index
  const stepDelay = 80 // milliseconds per intermediate item transition

  // Animate step-by-step through intermediate items
  while (currentIndex.value !== targetIndex) {
    if (currentIndex.value < targetIndex) {
      currentIndex.value++
    } else {
      currentIndex.value--
    }
    await new Promise((resolve) => setTimeout(resolve, stepDelay))
  }

  // Settle at target route & load content
  if (router) {
    await router.push(menuPath(menu))
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
  isAnimating.value = false
}
</script>

<template>
  <div
    class="admin-control-plane"
    :class="{
      'admin-control-plane--nav-open': isNavOpen,
      'admin-control-plane--collapsed': isCollapsed,
    }"
  >
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
          @click="handleToggle"
        >
          <X v-if="isMobile" :size="18" aria-hidden="true" />
          <template v-else>
            <ChevronRight v-if="isCollapsed" :size="14" aria-hidden="true" />
            <ChevronLeft v-else :size="14" aria-hidden="true" />
          </template>
        </button>
      </div>

      <nav ref="navRef" class="admin-nav" :aria-label="t('admin.module_label')">
        <div class="admin-nav__pill" :style="pillStyle"></div>
        <RouterLink
          v-for="(menu, index) in visibleMenus"
          :key="menu.id"
          class="admin-nav__link"
          :class="{ 'admin-nav__link--active': currentIndex === index }"
          :to="menuPath(menu)"
          :title="`Required: ${menu.required_permission}`"
          @click.prevent="handleMenuClick(menu, index)"
        >
          <span class="admin-nav__label">
            <component
              :is="menuIcons[menu.id] || CircleDot"
              class="admin-nav__icon"
              :size="16"
              aria-hidden="true"
            />
            <span class="admin-nav__text">{{ translateMenuLabel(menu) }}</span>
          </span>
        </RouterLink>
      </nav>

      <section
        v-if="session.principal"
        class="admin-principal"
        :aria-label="t('admin.principal_label')"
      >
        <div class="admin-principal__meta" style="display: grid; gap: 2px">
          <strong>{{ session.principal.display_name }}</strong>
          <span>{{ session.principal.email }}</span>
        </div>
        <div class="admin-principal__preferences">
          <LocaleSwitcher />
          <div class="admin-principal__actions">
            <UiThemeToggle />
            <a data-testid="admin-logout-action" class="admin-logout" :href="logoutHref">
              <LogOut :size="16" aria-hidden="true" />
              <span class="admin-logout__text">{{ t('admin.logout') }}</span>
            </a>
          </div>
        </div>
      </section>
    </aside>

    <div class="admin-main-column">
      <header data-testid="admin-topbar" class="admin-topbar">
        <div class="admin-topbar__title">
          <nav class="admin-breadcrumb" :aria-label="t('admin.breadcrumb_label')">
            <ol>
              <li class="admin-breadcrumb__desktop">{{ t('admin.brand_eyebrow') }}</li>
              <li class="admin-breadcrumb__desktop" aria-hidden="true">/</li>
              <li class="admin-breadcrumb__desktop">{{ t('admin.brand_title') }}</li>
              <template v-if="activeMenuLabel">
                <li class="admin-breadcrumb__desktop" aria-hidden="true">/</li>
                <li class="admin-breadcrumb__active">{{ activeMenuLabel }}</li>
              </template>
              <template v-else>
                <li class="admin-breadcrumb__active">{{ t('admin.brand_title') }}</li>
              </template>
            </ol>
          </nav>
          <button
            data-testid="admin-mobile-menu-toggle"
            class="admin-mobile-toggle"
            type="button"
            :aria-label="t('admin.open_navigation')"
            :aria-expanded="isNavOpen"
            @click="isNavOpen = true"
          >
            <Menu :size="18" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="admin-main" class="admin-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
