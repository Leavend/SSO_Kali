/**
 * useThemeStore — dark/light mode via VueUse useColorMode.
 */

import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useColorMode, usePreferredDark } from '@vueuse/core'

const THEME_SWITCH_CLASS = 'theme-switching' as const
const THEME_SWITCH_DURATION_MS = 720 as const

let transitionTimer: ReturnType<typeof window.setTimeout> | null = null

export const useThemeStore = defineStore('sso-theme', () => {
  // emitAuto keeps `mode` reporting the *selected* value ('auto' | 'light' |
  // 'dark') rather than collapsing 'auto' to its resolved scheme — the 3-way
  // appearance control needs to know when System is chosen.
  const mode = useColorMode({
    attribute: 'class',
    selector: 'html',
    modes: { light: '', dark: 'dark' },
    storageKey: 'dev-sso-theme',
    emitAuto: true,
  })

  const preferredDark = usePreferredDark()

  // Effective scheme: 'auto' resolves through the device preference. Drives the
  // binary toggle's icon + flip direction so it stays correct when System is on.
  const isDark = computed<boolean>(
    () => mode.value === 'dark' || (mode.value === 'auto' && preferredDark.value),
  )

  function initialize(): void {
    mode.value = mode.value
  }

  function toggle(): void {
    mode.value = isDark.value ? 'light' : 'dark'
  }

  // Explicit selection for the 3-way appearance control. 'auto' follows the
  // device via prefers-color-scheme; 'light'/'dark' are manual overrides.
  function setMode(next: 'light' | 'dark' | 'auto'): void {
    mode.value = next
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

  return { mode, isDark, initialize, toggle, toggleWithTransition, setMode }
})

function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined') return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
