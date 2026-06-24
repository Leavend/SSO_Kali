import { computed, ref } from 'vue'
import {
  safeWidgetAppUrl,
  ssoAccountWidgetApi,
  type SsoWidgetAccount,
  type SsoWidgetApp,
} from '@/services/sso-account-widget.api'

export type WidgetLoadState = 'idle' | 'loading' | 'ready' | 'error'

export function useSsoAccountBar() {
  const apps = ref<readonly SsoWidgetApp[]>([])
  const accounts = ref<readonly SsoWidgetAccount[]>([])
  const appsState = ref<WidgetLoadState>('idle')
  const accountsState = ref<WidgetLoadState>('idle')
  const switchState = ref<WidgetLoadState>('idle')
  const switchLoginUrl = ref<string | null>(null)
  const safeSwitchLoginUrl = computed<string | null>(() =>
    switchLoginUrl.value === null ? null : safeWidgetAppUrl(switchLoginUrl.value),
  )

  const visibleApps = computed<readonly SsoWidgetApp[]>(() =>
    apps.value.filter((app) => safeWidgetAppUrl(app.app_base_url) !== null),
  )

  const otherAccounts = computed<readonly SsoWidgetAccount[]>(() =>
    accounts.value.filter((account) => !account.is_current && account.account_id !== null),
  )

  async function loadApps(): Promise<void> {
    if (appsState.value !== 'idle') return
    appsState.value = 'loading'
    try {
      apps.value = await ssoAccountWidgetApi.apps()
      appsState.value = 'ready'
    } catch {
      appsState.value = 'error'
    }
  }

  async function loadAccounts(): Promise<void> {
    if (accountsState.value !== 'idle') return
    accountsState.value = 'loading'
    try {
      accounts.value = await ssoAccountWidgetApi.accounts()
      accountsState.value = 'ready'
    } catch {
      accountsState.value = 'error'
    }
  }

  async function switchAccount(accountId: string): Promise<{
    readonly success: boolean
    readonly login_url?: string
  }> {
    switchState.value = 'loading'
    switchLoginUrl.value = null
    try {
      const response = await ssoAccountWidgetApi.switchAccount(accountId)
      switchState.value = response.success ? 'ready' : 'error'
      switchLoginUrl.value = response.login_url ?? null
      accounts.value = []
      accountsState.value = 'idle'
      return { success: response.success, login_url: safeWidgetAppUrl(response.login_url ?? '') ?? undefined }
    } catch {
      switchState.value = 'error'
      accounts.value = []
      accountsState.value = 'idle'
      return { success: false }
    }
  }

  async function logout(): Promise<boolean> {
    try {
      const response = await ssoAccountWidgetApi.logout()
      return response.success
    } catch {
      return false
    }
  }

  return {
    appsState,
    accountsState,
    switchState,
    switchLoginUrl,
    safeSwitchLoginUrl,
    visibleApps,
    otherAccounts,
    loadApps,
    loadAccounts,
    switchAccount,
    logout,
  }
}
