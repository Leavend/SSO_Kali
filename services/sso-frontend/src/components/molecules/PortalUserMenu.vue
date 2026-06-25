<script setup lang="ts">
/**
 * PortalUserMenu — molecule: app launcher + account menu + logout button.
 */

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Grid3X3, LogOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AppAvatar from '@/components/molecules/AppAvatar.vue'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuthRedirect } from '@/composables/useAuthRedirect'
import { useSsoAccountBar } from '@/composables/useSsoAccountBar'
import { safeWidgetAppUrl } from '@/services/sso-account-widget.api'
import { cn } from '@/lib/utils'
import { useI18n } from '@/composables/useI18n'

type OpenPanel = 'apps' | 'account' | null

const { t } = useI18n()
const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  { compact: false },
)

const session = useSessionStore()
const redirect = useAuthRedirect()
const accountBar = useSsoAccountBar()

const root = ref<HTMLElement | null>(null)
type FocusTarget = HTMLElement | { $el?: HTMLElement } | null

const appsTrigger = ref<FocusTarget>(null)
const accountTrigger = ref<HTMLElement | null>(null)
const appsMenu = ref<HTMLElement | null>(null)
const accountMenu = ref<HTMLElement | null>(null)
const openPanel = ref<OpenPanel>(null)
const showLogoutDialog = ref<boolean>(false)
const isLoggingOut = ref<boolean>(false)
const displayName = computed<string>(() => session.user?.display_name ?? t('portal.home.user_fallback'))
const email = computed<string>(() => session.user?.email ?? '')

function askLogout(): void {
  showLogoutDialog.value = true
}

async function confirmLogout(): Promise<void> {
  isLoggingOut.value = true
  await accountBar.logout()
  session.clear()
  redirect.toLogin()
}

function toggleApps(): void {
  const nextPanel = openPanel.value === 'apps' ? null : 'apps'
  openPanel.value = nextPanel
  if (nextPanel === 'apps') void accountBar.loadApps()
  void focusOpenPanel()
}

function toggleAccount(): void {
  const nextPanel = openPanel.value === 'account' ? null : 'account'
  openPanel.value = nextPanel
  if (nextPanel === 'account') void accountBar.loadAccounts()
  void focusOpenPanel()
}

function close(restoreFocus = false): void {
  const panel = openPanel.value
  openPanel.value = null
  if (restoreFocus) focusTrigger(panel)
}

async function handleSwitch(accountId: string | null): Promise<void> {
  if (accountId === null) return
  const response = await accountBar.switchAccount(accountId)
  if (response.success) {
    window.location.reload()
    return
  }

  if (response.login_url) {
    window.location.assign(response.login_url)
  }
}

function safeInitial(value: string): string {
  const first = value.charAt(0).toUpperCase()
  return /^[A-Z0-9]$/u.test(first) ? first : 'A'
}

function handleDocumentClick(event: MouseEvent): void {
  if (!root.value || !(event.target instanceof Node)) return
  if (!root.value.contains(event.target)) close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  close(true)
}

function handleMenuKeydown(event: KeyboardEvent, panel: Exclude<OpenPanel, null>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return
  const items = focusableItems(panel)
  if (items.length === 0) return
  const activeIndex = items.findIndex((item) => item === document.activeElement)

  if (event.key === 'Tab') {
    event.preventDefault()
    const direction = event.shiftKey ? -1 : 1
    const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + items.length) % items.length
    items[nextIndex]?.focus()
    return
  }

  event.preventDefault()
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : activeIndex === -1
          ? 0
          : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  items[nextIndex]?.focus()
}

async function focusOpenPanel(): Promise<void> {
  await nextTick()
  const panel = openPanel.value
  if (panel === null) return
  focusableItems(panel)[0]?.focus()
}

function focusTrigger(panel: OpenPanel): void {
  if (panel === 'apps') focusTarget(appsTrigger.value)
  if (panel === 'account') accountTrigger.value?.focus()
}

function focusTarget(target: FocusTarget): void {
  if (target instanceof HTMLElement) {
    target.focus()
    return
  }
  if (target?.$el instanceof HTMLElement) {
    target.$el.focus()
  }
}

function focusableItems(panel: Exclude<OpenPanel, null>): HTMLElement[] {
  const menu = panel === 'apps' ? appsMenu.value : accountMenu.value
  if (!menu) return []
  return Array.from(
    menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ).filter((item) => !item.hasAttribute('disabled') && item.tabIndex !== -1)
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="relative flex items-center gap-2" data-testid="portal-account-bar">
    <Button
      ref="appsTrigger"
      variant="outline"
      size="icon"
      class="portal-nav-pill rounded-full"
      :aria-expanded="openPanel === 'apps'"
      aria-haspopup="menu"
      aria-label="Aplikasi SSO"
      data-testid="portal-account-apps-trigger"
      @click.stop="toggleApps"
    >
      <Grid3X3 class="size-4" aria-hidden="true" />
    </Button>

    <button
      ref="accountTrigger"
      type="button"
      :class="[
        'portal-account-pill flex min-w-0 items-center gap-2 rounded-full py-0.5 pl-0.5',
        props.compact ? 'portal-account-pill--compact' : 'pr-3',
      ]"
      :aria-expanded="openPanel === 'account'"
      aria-haspopup="menu"
      data-testid="portal-account-menu-trigger"
      @click.stop="toggleAccount"
    >
      <AppAvatar :name="displayName" :email="email" size="sm" class="ring-2 ring-white/50 dark:ring-white/15" />
      <div class="portal-account-identity hidden min-w-0 text-xs leading-tight sm:flex sm:flex-col">
        <strong class="truncate font-semibold text-[var(--text-primary)]">{{ displayName }}</strong>
        <span class="truncate text-[var(--text-secondary)]">{{ email }}</span>
      </div>
      <Badge
        v-if="session.user?.roles?.length"
        variant="secondary"
        :class="
          cn(
            'border border-[var(--glass-border-subtle)] bg-white/30 dark:bg-white/10',
            props.compact ? 'hidden' : 'hidden md:inline-flex',
          )
        "
      >
        {{ session.user.roles[0] }}
      </Badge>
    </button>

    <Button
      variant="outline"
      size="icon"
      :aria-label="t('portal.account.logout')"
      class="portal-nav-pill relative isolate overflow-hidden rounded-full"
      :disabled="isLoggingOut"
      @click="askLogout"
    >
      <LogOut class="size-4" />
    </Button>

    <section
      v-if="openPanel === 'apps'"
      ref="appsMenu"
      class="absolute right-0 top-[calc(100%+0.625rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] p-3 shadow-[var(--shadow-glass-md)] backdrop-blur-[var(--glass-blur-md)]"
      role="menu"
      aria-label="Aplikasi SSO"
      data-testid="portal-account-apps-menu"
      @keydown="handleMenuKeydown($event, 'apps')"
    >
      <p v-if="accountBar.appsState.value === 'loading'" class="p-3 text-xs text-[var(--text-secondary)]">
        Memuat aplikasi...
      </p>
      <p v-else-if="accountBar.appsState.value === 'error'" class="p-3 text-xs text-[var(--text-secondary)]">
        Gagal memuat aplikasi.
      </p>
      <p
        v-else-if="accountBar.visibleApps.value.length === 0"
        class="p-3 text-xs text-[var(--text-secondary)]"
      >
        Tidak ada aplikasi yang tersedia.
      </p>
      <div v-else class="grid grid-cols-3 gap-2">
        <a
          v-for="app in accountBar.visibleApps.value"
          :key="app.client_id"
          class="grid min-w-0 justify-items-center gap-1 rounded-xl p-2 text-center text-xs text-[var(--text-primary)] transition-colors hover:bg-white/45 dark:hover:bg-white/10"
          :href="safeWidgetAppUrl(app.app_base_url) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
        >
          <span
            class="flex size-9 items-center justify-center rounded-xl bg-white/50 font-bold text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] dark:bg-white/10"
          >
            {{ safeInitial(app.display_name) }}
          </span>
          <span class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{{ app.display_name }}</span>
        </a>
      </div>
    </section>

    <section
      v-if="openPanel === 'account'"
      ref="accountMenu"
      class="absolute right-0 top-[calc(100%+0.625rem)] z-50 grid w-[min(21rem,calc(100vw-2rem))] gap-2 rounded-2xl border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] p-3 shadow-[var(--shadow-glass-md)] backdrop-blur-[var(--glass-blur-md)]"
      role="menu"
      aria-label="Akun SSO"
      data-testid="portal-account-menu"
      @keydown="handleMenuKeydown($event, 'account')"
    >
      <div class="grid min-w-0 gap-1 px-2 py-2">
        <strong class="truncate text-sm text-[var(--text-primary)]">{{ displayName }}</strong>
        <span class="overflow-wrap-anywhere text-xs text-[var(--text-secondary)]">{{ email }}</span>
      </div>

      <RouterLink
        to="/profile"
        class="rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-white/45 dark:hover:bg-white/10"
        role="menuitem"
      >
        Kelola Akun
      </RouterLink>

      <div role="group" aria-label="Akun lain">
        <p
          v-if="accountBar.accountsState.value === 'loading'"
          class="px-3 py-2 text-xs text-[var(--text-secondary)]"
        >
          Memuat akun...
        </p>
        <p
          v-else-if="accountBar.accountsState.value === 'error'"
          class="px-3 py-2 text-xs text-[var(--text-secondary)]"
        >
          Gagal memuat akun.
        </p>
        <button
          v-for="account in accountBar.otherAccounts.value"
          :key="account.subject_id"
          type="button"
          class="grid w-full min-w-0 gap-0.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/45 dark:hover:bg-white/10"
          role="menuitem"
          :disabled="accountBar.switchState.value === 'loading'"
          @click="handleSwitch(account.account_id)"
        >
          <strong class="text-sm text-[var(--text-primary)]">{{ account.display_name }}</strong>
          <span class="overflow-wrap-anywhere text-xs text-[var(--text-secondary)]">
            {{ account.email }} · {{ account.status }}
          </span>
        </button>
        <p v-if="accountBar.switchState.value === 'error'" class="px-3 py-2 text-xs text-[var(--text-secondary)]">
          Sesi akun perlu dimuat ulang.
          <a v-if="accountBar.safeSwitchLoginUrl.value" :href="accountBar.safeSwitchLoginUrl.value" class="underline">
            Masuk ulang
          </a>
        </p>
      </div>
    </section>

    <ConfirmDialog
      v-model:open="showLogoutDialog"
      :title="t('portal.account.logout_title')"
      :description="t('portal.account.logout_description')"
      :confirm-label="t('portal.account.logout')"
      destructive
      @confirm="confirmLogout"
    />
  </div>
</template>
