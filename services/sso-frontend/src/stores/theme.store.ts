/**
 * useThemeStore — dark/light mode via VueUse useColorMode.
 */

import { defineStore } from 'pinia'
import { useColorMode } from '@vueuse/core'

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

  return { mode, initialize, toggle }
})
