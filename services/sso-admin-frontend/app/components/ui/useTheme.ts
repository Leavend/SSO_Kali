import { computed, ref } from 'vue'

export type AdminTheme = 'light' | 'dark'

const STORAGE_KEY = 'dev-sso-admin-theme' as const
const theme = ref<AdminTheme>(detectInitialTheme())

syncDocumentTheme(theme.value)

export function useTheme() {
  const isDark = computed<boolean>(() => theme.value === 'dark')

  function setTheme(nextTheme: AdminTheme): void {
    theme.value = nextTheme
    syncDocumentTheme(nextTheme)
    persistTheme(nextTheme)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: computed(() => theme.value), isDark, setTheme, toggleTheme }
}

function detectInitialTheme(): AdminTheme {
  return readStoredTheme() ?? 'dark'
}

function readStoredTheme(): AdminTheme | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function syncDocumentTheme(nextTheme: AdminTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', nextTheme === 'dark')
  document.documentElement.dataset.adminTheme = nextTheme
}

function persistTheme(nextTheme: AdminTheme): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  } catch {
    // Theme persistence is best-effort and never security critical.
  }
}
