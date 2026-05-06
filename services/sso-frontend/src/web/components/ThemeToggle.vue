<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { AUTH_SHELL, getNextTheme, normalizeTheme } from '@parent-ui/auth-shell.mjs'
import type { Theme } from '@parent-ui/auth-shell.mjs'

const THEME_STORAGE_KEY = 'devsso-theme-preference'
const SYSTEM_PREFERENCE_MEDIA = '(prefers-color-scheme: dark)'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

const props = withDefaults(
  defineProps<{
    initialTheme?: Theme
    systemPreference?: boolean
  }>(),
  {
    initialTheme: AUTH_SHELL.theme.defaultTheme,
    systemPreference: true,
  },
)

const theme = ref<Theme>(resolveInitialTheme())
const systemTheme = ref<Theme>(getSystemTheme())
const isDark = computed(() => theme.value === 'dark')
let mediaQuery: MediaQueryList | null = null

onMounted(() => {
  applyTheme(theme.value)
  setupSystemPreferenceListener()
})

onUnmounted(() => {
  cleanupSystemPreferenceListener()
})

watch(theme, (value) => {
  applyTheme(value)
  saveTheme(value)
})

function toggleTheme(): void {
  const next = getNextTheme(theme.value)
  theme.value = next
}

function applyTheme(value: Theme): void {
  const normalized = normalizeTheme(value)
  document.documentElement.setAttribute(AUTH_SHELL.theme.attribute, normalized)
  document.documentElement.classList.toggle(AUTH_SHELL.theme.darkClass, normalized === 'dark')
}

function resolveInitialTheme(): Theme {
  const saved = loadTheme()
  if (saved) {
    return saved
  }

  if (props.systemPreference) {
    return getSystemTheme()
  }

  return normalizeTheme(props.initialTheme)
}

function saveTheme(value: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value)
  } catch (error) {
    console.warn('localStorage unavailable, using cookie fallback')
    saveThemeCookie(value)
  }
}

function loadTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && (stored === 'light' || stored === 'dark')) {
      return stored as Theme
    }
  } catch (error) {
    console.warn('localStorage unavailable, reading from cookie')
  }
  return loadThemeCookie()
}

function clearTheme(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY)
  } catch (error) {
    clearThemeCookie()
  }
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }
  return window.matchMedia(SYSTEM_PREFERENCE_MEDIA).matches ? 'dark' : 'light'
}

function setupSystemPreferenceListener(): void {
  if (!props.systemPreference || typeof window === 'undefined' || !window.matchMedia) {
    return
  }

  mediaQuery = window.matchMedia(SYSTEM_PREFERENCE_MEDIA)

  const handler = (event: MediaQueryListEvent): void => {
    systemTheme.value = event.matches ? 'dark' : 'light'
    if (!loadTheme()) {
      theme.value = systemTheme.value
    }
  }

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler)
  } else {
    mediaQuery.addListener(handler)
  }
}

function cleanupSystemPreferenceListener(): void {
  if (!mediaQuery) {
    return
  }

  const handler = (event: MediaQueryListEvent): void => {
    systemTheme.value = event.matches ? 'dark' : 'light'
    if (!loadTheme()) {
      theme.value = systemTheme.value
    }
  }

  if (mediaQuery.removeEventListener) {
    mediaQuery.removeEventListener('change', handler)
  } else {
    mediaQuery.removeListener(handler)
  }
}

function saveThemeCookie(value: Theme): void {
  try {
    document.cookie = `${THEME_STORAGE_KEY}=${value}; max-age=${COOKIE_MAX_AGE}; path=/; secure; samesite=lax`
  } catch (error) {
    console.warn('Failed to set theme cookie:', error)
  }
}

function loadThemeCookie(): Theme | null {
  try {
    const cookies = document.cookie.split('; ')
    const themeCookie = cookies.find((c: string) => c.startsWith(`${THEME_STORAGE_KEY}=`))
    if (themeCookie) {
      const value = themeCookie.split('=')[1]
      if (value === 'light' || value === 'dark') {
        return value as Theme
      }
    }
  } catch (error) {
    console.warn('Failed to read theme cookie:', error)
  }
  return null
}

function clearThemeCookie(): void {
  try {
    document.cookie = `${THEME_STORAGE_KEY}=; max-age=0; path=/; secure; samesite=lax`
  } catch (error) {
    console.warn('Failed to clear theme cookie:', error)
  }
}
</script>

<template>
  <button
    :id="AUTH_SHELL.theme.toggleId"
    :class="AUTH_SHELL.theme.toggleClass"
    type="button"
    :aria-label="isDark ? AUTH_SHELL.theme.lightLabel : AUTH_SHELL.theme.darkLabel"
    :title="isDark ? 'Terang' : 'Gelap'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="16" aria-hidden="true" />
    <Moon v-else :size="16" aria-hidden="true" />
  </button>
</template>
