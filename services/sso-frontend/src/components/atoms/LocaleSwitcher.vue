<script setup lang="ts">
import { Languages } from 'lucide-vue-next'
import { useI18n, type SupportedLocale } from '@/composables/useI18n'

const { availableLocales, locale, setLocale, t } = useI18n()

function selectLocale(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as SupportedLocale
  setLocale(value)
}
</script>

<template>
  <label
    class="portal-nav-pill inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-white/20 px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-glass-sm)] transition-colors hover:bg-white/35 hover:text-[var(--text-primary)] dark:bg-white/10 dark:hover:bg-white/15"
  >
    <Languages class="size-4" aria-hidden="true" />
    <span class="sr-only">{{ t('language.label') }}</span>
    <select
      class="bg-transparent text-xs font-semibold uppercase outline-none"
      :aria-label="t('language.label')"
      :value="locale"
      @change="selectLocale"
    >
      <option v-for="item in availableLocales" :key="item" :value="item">
        {{ t(`language.${item}`) }}
      </option>
    </select>
  </label>
</template>
