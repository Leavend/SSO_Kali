<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Grid3X3, LogOut, UserRound } from 'lucide-vue-next'
import { safeWidgetAppUrl } from '@/services/sso-account-widget.api'
import { useSsoAccountBar } from '@/composables/useSsoAccountBar'
import { useSessionStore } from '@/stores/session.store'

type OpenPanel = 'apps' | 'account' | null

const session = useSessionStore()
const root = ref<HTMLElement | null>(null)
const appsTrigger = ref<HTMLButtonElement | null>(null)
const accountTrigger = ref<HTMLButtonElement | null>(null)
const appsMenu = ref<HTMLElement | null>(null)
const accountMenu = ref<HTMLElement | null>(null)
const openPanel = ref<OpenPanel>(null)
const accountBar = useSsoAccountBar()

const initial = computed<string>(() => safeInitial(session.principal?.display_name ?? 'A'))
const displayName = computed<string>(() => session.principal?.display_name ?? 'Admin')
const email = computed<string>(() => session.principal?.email ?? '')

function toggleApps(): void {
  openPanel.value = openPanel.value === 'apps' ? null : 'apps'
  void accountBar.loadApps()
  void focusOpenPanel()
}

function toggleAccount(): void {
  openPanel.value = openPanel.value === 'account' ? null : 'account'
  void accountBar.loadAccounts()
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

async function handleLogout(): Promise<void> {
  const loggedOut = await accountBar.logout()
  if (loggedOut) {
    window.location.reload()
  }
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
  if (panel === 'apps') appsTrigger.value?.focus()
  if (panel === 'account') accountTrigger.value?.focus()
}

function focusableItems(panel: Exclude<OpenPanel, null>): HTMLElement[] {
  const menu = panel === 'apps' ? appsMenu.value : accountMenu.value
  if (!menu) return []
  return Array.from(
    menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  ).filter((item) => !item.hasAttribute('disabled') && item.tabIndex !== -1)
}

function safeInitial(value: string): string {
  const first = value.charAt(0).toUpperCase()
  return /^[A-Z0-9]$/u.test(first) ? first : 'A'
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
  <div ref="root" class="sso-account-bar" data-testid="sso-account-bar">
    <button
      ref="appsTrigger"
      class="sso-account-bar__trigger"
      type="button"
      aria-label="Aplikasi SSO"
      aria-haspopup="menu"
      :aria-expanded="openPanel === 'apps'"
      data-testid="sso-account-apps-trigger"
      @click.stop="toggleApps"
    >
      <Grid3X3 :size="17" aria-hidden="true" />
    </button>

    <button
      ref="accountTrigger"
      class="sso-account-bar__trigger sso-account-bar__avatar"
      type="button"
      aria-label="Akun SSO"
      aria-haspopup="menu"
      :aria-expanded="openPanel === 'account'"
      data-testid="sso-account-menu-trigger"
      @click.stop="toggleAccount"
    >
      {{ initial }}
    </button>

    <section
      v-if="openPanel === 'apps'"
      ref="appsMenu"
      class="sso-account-bar__popover sso-account-bar__popover--apps"
      role="menu"
      aria-label="Aplikasi SSO"
      data-testid="sso-account-apps-menu"
      @keydown="handleMenuKeydown($event, 'apps')"
    >
      <p v-if="accountBar.appsState.value === 'loading'" class="sso-account-bar__status">
        Memuat aplikasi...
      </p>
      <p v-else-if="accountBar.appsState.value === 'error'" class="sso-account-bar__status">
        Gagal memuat aplikasi.
      </p>
      <p v-else-if="accountBar.visibleApps.value.length === 0" class="sso-account-bar__status">
        Tidak ada aplikasi yang tersedia.
      </p>
      <div v-else class="sso-account-bar__app-grid">
        <a
          v-for="app in accountBar.visibleApps.value"
          :key="app.client_id"
          class="sso-account-bar__app"
          :href="safeWidgetAppUrl(app.app_base_url) ?? undefined"
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
        >
          <span class="sso-account-bar__app-icon">{{ safeInitial(app.display_name) }}</span>
          <span>{{ app.display_name }}</span>
        </a>
      </div>
    </section>

    <section
      v-if="openPanel === 'account'"
      ref="accountMenu"
      class="sso-account-bar__popover"
      role="menu"
      aria-label="Akun SSO"
      data-testid="sso-account-menu"
      @keydown="handleMenuKeydown($event, 'account')"
    >
      <div class="sso-account-bar__identity">
        <span class="sso-account-bar__identity-icon" aria-hidden="true">
          <UserRound :size="18" />
        </span>
        <strong>{{ displayName }}</strong>
        <span>{{ email }}</span>
      </div>

      <RouterLink class="sso-account-bar__action" :to="{ name: 'admin.profile' }" role="menuitem">
        Kelola Akun
      </RouterLink>

      <div class="sso-account-bar__accounts" role="group" aria-label="Akun lain">
        <p v-if="accountBar.accountsState.value === 'loading'" class="sso-account-bar__status">
          Memuat akun...
        </p>
        <p v-else-if="accountBar.accountsState.value === 'error'" class="sso-account-bar__status">
          Gagal memuat akun.
        </p>
        <button
          v-for="account in accountBar.otherAccounts.value"
          :key="account.subject_id"
          class="sso-account-bar__account"
          type="button"
          role="menuitem"
          :disabled="accountBar.switchState.value === 'loading'"
          @click="handleSwitch(account.account_id)"
        >
          <strong>{{ account.display_name }}</strong>
          <span>{{ account.email }} · {{ account.status }}</span>
        </button>
        <p v-if="accountBar.switchState.value === 'error'" class="sso-account-bar__status">
          Sesi akun perlu dimuat ulang.
          <a v-if="accountBar.safeSwitchLoginUrl.value" :href="accountBar.safeSwitchLoginUrl.value">Masuk ulang</a>
        </p>
      </div>

      <button
        class="sso-account-bar__action sso-account-bar__action--danger"
        type="button"
        role="menuitem"
        @click="handleLogout"
      >
        <LogOut :size="16" aria-hidden="true" />
        <span>Keluar</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.sso-account-bar {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.sso-account-bar__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--foreground);
  cursor: pointer;
}

.sso-account-bar__trigger:hover,
.sso-account-bar__trigger[aria-expanded='true'] {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--border));
  color: var(--primary);
}

.sso-account-bar__avatar {
  font-size: var(--text-xs);
  font-weight: 900;
}

.sso-account-bar__popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  display: grid;
  width: min(320px, calc(100vw - 32px));
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-modal);
}

.sso-account-bar__popover--apps {
  width: min(360px, calc(100vw - 32px));
}

.sso-account-bar__app-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.sso-account-bar__app,
.sso-account-bar__account,
.sso-account-bar__action {
  min-width: 0;
  border-radius: 10px;
  color: var(--foreground);
  text-decoration: none;
}

.sso-account-bar__app {
  display: grid;
  gap: 6px;
  justify-items: center;
  padding: 10px 8px;
  text-align: center;
}

.sso-account-bar__app span:last-child,
.sso-account-bar__account span,
.sso-account-bar__identity span {
  overflow-wrap: anywhere;
}

.sso-account-bar__app-icon,
.sso-account-bar__identity-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
  font-weight: 900;
}

.sso-account-bar__identity,
.sso-account-bar__account {
  display: grid;
  gap: 2px;
}

.sso-account-bar__identity {
  justify-items: start;
  padding: 4px 2px 8px;
}

.sso-account-bar__identity strong,
.sso-account-bar__account strong {
  font-size: var(--text-sm);
}

.sso-account-bar__identity span,
.sso-account-bar__account span,
.sso-account-bar__status {
  color: var(--muted-foreground);
  font-size: var(--text-xs);
}

.sso-account-bar__action,
.sso-account-bar__account {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sso-account-bar__account {
  display: grid;
}

.sso-account-bar__app:hover,
.sso-account-bar__action:hover,
.sso-account-bar__account:hover {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.sso-account-bar__action--danger {
  color: var(--destructive);
}

@media (max-width: 720px) {
  .sso-account-bar__popover {
    right: -8px;
  }
}
</style>
