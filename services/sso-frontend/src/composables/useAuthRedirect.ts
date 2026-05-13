/**
 * useAuthRedirect — composable untuk side-effect navigasi auth.
 *
 * Memisahkan `window.location.*` dari store supaya store testable
 * tanpa mock DOM global.
 */

import { useRouter } from 'vue-router'

export function useAuthRedirect() {
  const router = useRouter()

  function toLogin(redirect?: string): void {
    router.push({ name: 'auth.login', query: redirect ? { redirect } : {} })
  }

  function toHome(): void {
    router.push({ name: 'home' })
  }

  function reloadTo(path: string): void {
    window.location.assign(path)
  }

  return { toLogin, toHome, reloadTo }
}
