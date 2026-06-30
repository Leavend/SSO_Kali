import type { Page } from '@playwright/test'

// Cookies must be set for the server host so they ride the SSR document request
// (the principal + locale are resolved during SSR, before any client JS). The
// e2e layer's me.get.ts reads `e2e_perms`; useI18n.ts reads `admin_locale`.
async function addCookie(page: Page, name: string, value: string): Promise<void> {
  await page.context().addCookies([{ name, value, url: 'http://localhost:3000' }])
}

export async function useEnglish(page: Page): Promise<void> {
  await addCookie(page, 'admin_locale', 'en')
}

export async function usePermissions(page: Page, permissions: readonly string[]): Promise<void> {
  await addCookie(page, 'e2e_perms', permissions.join(','))
}
