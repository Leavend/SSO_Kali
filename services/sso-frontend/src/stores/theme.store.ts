/**
 * useThemeStore — dark/light mode via VueUse useColorMode.
 */

import { defineStore } from 'pinia'
import { useColorMode } from '@vueuse/core'

const THEME_SWITCH_CLASS = 'theme-switching' as const
const THEME_SWITCH_DURATION_MS = 720 as const

let transitionTimer: ReturnType<typeof window.setTimeout> | null = null

export const useThemeStore = defineStore('sso-theme', () => {
  const mode = useColorMode({
    attribute: 'class',
    selector: 'html',
    modes: { light: '', dark: 'dark' },
    storageKey: 'dev-sso-theme',
  })

  function initialize(): void {
    mode.value = mode.value
  }

  function toggle(): void {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  function toggleWithTransition(): void {
    if (shouldReduceMotion()) {
      toggle()
      return
    }

    const root = document.documentElement
    root.classList.remove(THEME_SWITCH_CLASS)
    // Force reflow so repeated toggles restart the animation cleanly.
    void root.offsetWidth
    root.classList.add(THEME_SWITCH_CLASS)
    toggle()

    if (transitionTimer !== null) window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => {
      root.classList.remove(THEME_SWITCH_CLASS)
      transitionTimer = null
    }, THEME_SWITCH_DURATION_MS)
  }

  return { mode, initialize, toggle, toggleWithTransition }
})

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
