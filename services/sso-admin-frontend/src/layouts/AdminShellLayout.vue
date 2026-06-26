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
  BookOpen,
  ExternalLink,
  Search,
} from 'lucide-vue-next'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLauncher from '@/components/AppLauncher.vue'
import LocaleSwitcher from '@/components/LocaleSwitcher.vue'
import SsoAccountBar from '@/components/SsoAccountBar.vue'
import UiThemeToggle from '@/components/ui/UiThemeToggle.vue'
import { useI18n } from '@/composables/useI18n'
import { resolveBootstrapFailure, resolveLoadedAdminAccess } from '@/router/guards'
import { useSessionStore } from '@/stores/session.store'
import type { AdminPermissionMenu } from '@/types/auth.types'
import { getAdminEnvironment } from '@/config/adminEnvironment'

const session = useSessionStore()
const { t, locale } = useI18n()
const isNavOpen = ref(false)
const docsBaseUrl = getAdminEnvironment().docsBaseUrl

// Sidebar menu search (inline with the nav, per Bontang handoff). The pill index
// logic below maps to `visibleMenus[currentIndex]` and reads `navRef.children[idx + 1]`
// (children[0] is the pill div). To keep that mapping intact we DO NOT filter the
// rendered nav list; instead we toggle a `.admin-nav__link--hidden` class on the
// non-matching links via `isMenuFiltered`, and hide the pill entirely while a
// filter is active so it can never point at a hidden item. Empty filter shows all.
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const normalizedSearch = computed<string>(() => searchQuery.value.trim().toLowerCase())
const isFiltering = computed<boolean>(() => normalizedSearch.value.length > 0)

const route = useRoute()
const router = useRouter()
const currentIndex = ref(-1)
const isAnimating = ref(false)
const navRef = ref<HTMLElement | null>(null)
const sidebarRef = ref<HTMLElement | null>(null)
const pillStyle = ref({ top: '0px', height: '0px', opacity: '0' })

const isTest = import.meta.env.MODE === 'test'

const visibleMenus = computed<readonly AdminPermissionMenu[]>(() =>
  (session.principal?.permissions.menus ?? []).filter((menu) => menu.visible),
)

function applyAdminBootstrapOutcome(): void {
  if (!route?.meta?.requiresAdmin || !router) return

  const bootstrapRedirect = resolveBootstrapFailure(session.lastEnsureResult, route.fullPath)
  if (bootstrapRedirect === false) return
  if (bootstrapRedirect) {
    void router.replace(bootstrapRedirect)
    return
  }

  const accessRedirect = resolveLoadedAdminAccess(route)
  if (accessRedirect !== true) {
    void router.replace(accessRedirect)
  }
}

watch(
  [() => session.lastEnsureResult, () => session.principal, () => route?.fullPath],
  applyAdminBootstrapOutcome,
  { immediate: true },
)

function translateMenuLabel(menu: AdminPermissionMenu): string {
  const translationKey = `menu.${menu.id}`
  const translated = t(translationKey)
  return translated === translationKey ? menu.label : translated
}

// Precompute the set of menu ids that match the current filter as a `computed`
// so the template's `v-show` binding tracks `searchQuery` + `locale` reactively
// (a plain method with an early `return true` can skip dependency tracking on the
// first, unfiltered render). The pill source stays `visibleMenus`, so this only
// drives which links are *shown*, never the pill index.
const matchingMenuIds = computed<ReadonlySet<string>>(() => {
  const ids = new Set<string>()
  const query = normalizedSearch.value
  for (const menu of visibleMenus.value) {
    if (!query || translateMenuLabel(menu).toLowerCase().includes(query)) {
      ids.add(menu.id)
    }
  }
  return ids
})

function menuMatchesSearch(menu: AdminPermissionMenu): boolean {
  return matchingMenuIds.value.has(menu.id)
}

const hasSearchMatches = computed<boolean>(() =>
  !isFiltering.value || matchingMenuIds.value.size > 0,
)

function focusSearchInput(): void {
  requestAnimationFrame(() => searchInputRef.value?.focus())
}

const activeMenuLabel = computed<string>(() => {
  const currentMenu = visibleMenus.value[currentIndex.value]
  return currentMenu ? translateMenuLabel(currentMenu) : ''
})

watch(
  [activeMenuLabel, locale],
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
  if (menu.id === 'audit') return '/observability'

  return `/${menu.id}`
}

// Same-origin admin BFF logout. GET /auth/logout revokes the admin's access +
// refresh tokens (which triggers IdP single sign-out via /connect/logout),
// deletes the server-side session record, and clears the session cookie. This
// must stay same-origin — pointing it at the portal origin leaves this BFF
// session fully intact, so the admin stays logged in.
const logoutHref = '/auth/logout'

function closeNav(): void {
  isNavOpen.value = false
}

function openNav(): void {
  isNavOpen.value = true
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

let previousBodyOverflow = ''
let didLockBodyScroll = false

function lockBodyScroll(): void {
  if (didLockBodyScroll) return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  didLockBodyScroll = true
}

function unlockBodyScroll(): void {
  if (!didLockBodyScroll) return
  document.body.style.overflow = previousBodyOverflow
  didLockBodyScroll = false
}

function getFocusableSidebarElements(): HTMLElement[] {
  if (!sidebarRef.value) return []
  return Array.from(
    sidebarRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || isTest)
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!isNavOpen.value || !isMobile.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeNav()
    return
  }

  if (event.key !== 'Tab') return

  const focusableElements = getFocusableSidebarElements()
  if (focusableElements.length === 0) return

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (event.shiftKey && activeElement === firstElement) {
    event.preventDefault()
    lastElement?.focus()
  } else if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault()
    firstElement?.focus()
  }
}

watch(
  [isNavOpen, isMobile],
  ([open, mobile]) => {
    if (typeof document === 'undefined') return

    if (open && mobile) {
      lockBodyScroll()
      document.addEventListener('keydown', handleDocumentKeydown)
      requestAnimationFrame(() => {
        getFocusableSidebarElements()[0]?.focus()
      })
      return
    }

    unlockBodyScroll()
    document.removeEventListener('keydown', handleDocumentKeydown)
  },
  { flush: 'post' },
)

onUnmounted(() => {
  unlockBodyScroll()
  document.removeEventListener('keydown', handleDocumentKeydown)
})

function handleToggle(): void {
  if (isMobile.value) {
    isNavOpen.value = !isNavOpen.value
  } else {
    isCollapsed.value = !isCollapsed.value
    // Collapsing to the rail hides the full search field, so clear any active
    // filter — otherwise the rail would show only a subset of nav icons.
    if (isCollapsed.value) searchQuery.value = ''
    localStorage.setItem('sso-sidebar-collapsed', String(isCollapsed.value))
    setTimeout(updatePillPosition, 260)
  }
}

// In the collapsed (rail) state the search shrinks to its icon button. Clicking it
// expands the sidebar so the full search field is usable, then moves focus into it.
function expandAndFocusSearch(): void {
  if (isCollapsed.value && !isMobile.value) {
    isCollapsed.value = false
    localStorage.setItem('sso-sidebar-collapsed', 'false')
    setTimeout(updatePillPosition, 260)
  }
  focusSearchInput()
}

function getMenuIndexByPath(path: string): number {
  let bestIdx = -1
  let bestLen = -1
  visibleMenus.value.forEach((menu, i) => {
    const mp = menuPath(menu)
    if ((path === mp || path.startsWith(mp + '/')) && mp.length > bestLen) {
      bestIdx = i
      bestLen = mp.length
    }
  })
  return bestIdx
}

function updatePillPosition() {
  if (!navRef.value) return
  const idx = currentIndex.value
  if (idx < 0 || idx >= visibleMenus.value.length) {
    pillStyle.value = { top: '0px', height: '0px', opacity: '0' }
    return
  }
  const activeLink = navRef.value.children[idx + 1] as HTMLElement
  if (activeLink) {
    pillStyle.value = {
      top: `${activeLink.offsetTop}px`,
      height: `${activeLink.offsetHeight}px`,
      opacity: '1',
    }
  } else {
    requestAnimationFrame(updatePillPosition)
  }
}

watch(
  [() => route?.path, visibleMenus],
  ([newPath]) => {
    if (newPath && !isAnimating.value) {
      currentIndex.value = getMenuIndexByPath(newPath)
    }
  },
  { immediate: true },
)

watch(
  [currentIndex, visibleMenus, isCollapsed],
  () => {
    updatePillPosition()
  },
  { immediate: true, flush: 'post' },
)

let resizeHandler: (() => void) | null = null

onMounted(() => {
  updatePillPosition()
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
  const mp = menuPath(menu)
  if ((index === currentIndex.value && route?.path === mp) || isAnimating.value) return

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
    <button
      v-if="isNavOpen"
      class="admin-sidebar__backdrop"
      type="button"
      :aria-label="t('admin.close_navigation')"
      @click="closeNav"
    ></button>

    <aside ref="sidebarRef" class="admin-sidebar" :aria-label="t('admin.sidebar_label')">
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

      <div class="admin-search" :class="{ 'admin-search--rail': isCollapsed && !isMobile }">
        <button
          v-if="isCollapsed && !isMobile"
          class="admin-search__rail-button"
          type="button"
          :aria-label="t('admin.search_menus')"
          :data-tooltip="t('admin.search_menus')"
          @click="expandAndFocusSearch"
        >
          <Search :size="16" aria-hidden="true" />
        </button>
        <template v-else>
          <label class="admin-search__label" for="admin-menu-search">{{
            t('admin.search_menus')
          }}</label>
          <span class="admin-search__field">
            <Search class="admin-search__icon" :size="16" aria-hidden="true" />
            <input
              id="admin-menu-search"
              ref="searchInputRef"
              v-model="searchQuery"
              class="admin-search__input"
              type="search"
              autocomplete="off"
              :placeholder="t('admin.search_menus_placeholder')"
            />
          </span>
        </template>
      </div>

      <nav ref="navRef" class="admin-nav" :aria-label="t('admin.module_label')">
        <div v-show="!isFiltering" class="admin-nav__pill" :style="pillStyle"></div>
        <RouterLink
          v-for="(menu, index) in visibleMenus"
          v-show="menuMatchesSearch(menu)"
          :key="menu.id"
          class="admin-nav__link"
          :class="{ 'admin-nav__link--active': currentIndex === index && !isFiltering }"
          :to="menuPath(menu)"
          :data-tooltip="translateMenuLabel(menu)"
          :title="translateMenuLabel(menu)"
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
        <p v-if="!hasSearchMatches" class="admin-nav__empty" role="status">
          {{ t('admin.search_no_menus') }}
        </p>
      </nav>

      <a
        class="admin-nav__link admin-nav__link--external"
        :href="docsBaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="t('admin.nav_docs')"
        :data-tooltip="t('admin.nav_docs')"
      >
        <span class="admin-nav__label">
          <BookOpen class="admin-nav__icon" :size="16" aria-hidden="true" />
          <span v-show="!isCollapsed" class="admin-nav__text">{{ t('admin.nav_docs') }}</span>
        </span>
        <ExternalLink v-show="!isCollapsed" :size="12" aria-hidden="true" />
      </a>

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
          <LocaleSwitcher :collapsed="isCollapsed" />
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
            @click="openNav"
          >
            <Menu :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="admin-topbar__actions">
          <AppLauncher align="right" />
          <SsoAccountBar v-if="session.principal" />
        </div>
      </header>

      <main id="admin-main" class="admin-content" tabindex="-1">
        <RouterView />
      </main>
    </div>
  </div>
</template>
