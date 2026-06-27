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
    if (appsState.value === 'loading' || appsState.value === 'ready') return
    appsState.value = 'loading'
    try {
      apps.value = await ssoAccountWidgetApi.apps()
      appsState.value = 'ready'
    } catch (error) {
      reportWidgetFailure('apps', error)
      appsState.value = 'error'
    }
  }

  async function loadAccounts(): Promise<void> {
    if (accountsState.value === 'loading' || accountsState.value === 'ready') return
    accountsState.value = 'loading'
    try {
      accounts.value = await ssoAccountWidgetApi.accounts()
      accountsState.value = 'ready'
    } catch (error) {
      reportWidgetFailure('accounts', error)
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
      resetAccounts()
      return {
        success: response.success,
        login_url: safeWidgetAppUrl(response.login_url ?? '') ?? undefined,
      }
    } catch (error) {
      reportWidgetFailure('switch', error)
      switchState.value = 'error'
      resetAccounts()
      return { success: false }
    }
  }

  async function logout(): Promise<boolean> {
    try {
      const response = await ssoAccountWidgetApi.logout()
      reset()
      return response.success
    } catch (error) {
      reportWidgetFailure('logout', error)
      reset()
      return false
    }
  }

  function reset(): void {
    apps.value = []
    appsState.value = 'idle'
    resetAccounts()
    switchState.value = 'idle'
    switchLoginUrl.value = null
  }

  function resetAccounts(): void {
    accounts.value = []
    accountsState.value = 'idle'
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
    reset,
  }
}

function reportWidgetFailure(scope: string, error: unknown): void {
  console.warn(`[sso-account-bar] widget ${scope} request failed`, error)
}
