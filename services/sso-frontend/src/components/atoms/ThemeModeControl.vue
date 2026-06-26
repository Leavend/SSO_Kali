<script setup lang="ts">
/**
 * ThemeModeControl — atom: 3-way appearance picker (Light / Dark / System).
 *
 * Restores manual theme control after the device-only experiment. 'System'
 * (auto) follows prefers-color-scheme; Light/Dark are explicit overrides.
 *
 * Context-aware ARIA: inside PortalUserMenu's `role="menu"` the options are
 * `menuitemradio` in a `group` (the valid radio-in-menu pattern); set
 * `standalone` for use outside a menu (e.g. the auth shell), where it becomes a
 * `radiogroup` of `radio`. In that standalone mode it also follows the ARIA
 * radiogroup keyboard pattern — one tab stop (roving tabindex) with Arrow /
 * Home / End moving focus and selection together. In-menu mode delegates arrow
 * navigation to PortalUserMenu's `role="menu"` handler, so the keydown handler
 * here no-ops and the event bubbles.
 */

import { computed, ref } from 'vue'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme.store'
import { useI18n } from '@/composables/useI18n'

const props = withDefaults(defineProps<{ standalone?: boolean }>(), { standalone: false })

const theme = useThemeStore()
const { t } = useI18n()

const options = [
  { mode: 'light', icon: Sun, labelKey: 'appearance.light' },
  { mode: 'dark', icon: Moon, labelKey: 'appearance.dark' },
  { mode: 'auto', icon: Monitor, labelKey: 'appearance.system' },
] as const

const rootRef = ref<HTMLElement | null>(null)

// Single source of truth for the active option, with a defensive fallback to the
// first option when theme.mode is outside the known set (useColorMode passes a
// corrupted/foreign stored value through unclamped). Both the roving tabindex and
// aria-checked are driven off this, so the radiogroup always exposes exactly one
// tab stop / one checked radio (ARIA APG requirement).
const activeIndex = computed<number>(() => {
  const index = options.findIndex((option) => option.mode === theme.mode)
  return index === -1 ? 0 : index
})

function onKeydown(event: KeyboardEvent): void {
  if (!props.standalone) return
  const last = options.length - 1
  const current = activeIndex.value
  let next: number
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = current === last ? 0 : current + 1
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = current === 0 ? last : current - 1
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    default:
      return
  }
  event.preventDefault()
  theme.setMode(options[next].mode)
  // Selection follows focus: move focus to the newly selected radio.
  rootRef.value?.querySelectorAll<HTMLElement>('[data-mode]')[next]?.focus()
}
</script>

<template>
  <div
    ref="rootRef"
    :role="props.standalone ? 'radiogroup' : 'group'"
    :aria-label="t('appearance.label')"
    class="inline-flex items-center gap-0.5 rounded-full border border-[var(--glass-border-subtle)] bg-white/20 p-0.5 dark:bg-white/10"
    @keydown="onKeydown"
  >
    <button
      v-for="(option, index) in options"
      :key="option.mode"
      type="button"
      :role="props.standalone ? 'radio' : 'menuitemradio'"
      :data-mode="option.mode"
      :aria-checked="index === activeIndex"
      :aria-label="t(option.labelKey)"
      :title="t(option.labelKey)"
      :tabindex="props.standalone ? (index === activeIndex ? 0 : -1) : undefined"
      :class="[
        'inline-flex size-8 items-center justify-center rounded-full transition-colors',
        index === activeIndex
          ? 'bg-white/70 text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] dark:bg-white/15'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      ]"
      @click="theme.setMode(option.mode)"
    >
      <component :is="option.icon" class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
