<script setup lang="ts">
import { computed } from 'vue'
import { Languages } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const { locale, setLocale, t } = useI18n()
const ariaLabel = computed<string>(() =>
  locale.value === 'id' ? t('language.switch_to_en') : t('language.switch_to_id'),
)

function toggleLocale(): void {
  const nextLocale = locale.value === 'id' ? 'en' : 'id'
  setLocale(nextLocale)
}
</script>

<template>
  <button
    class="portal-nav-pill inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-white/20 px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-glass-sm)] transition-colors hover:bg-white/35 hover:text-[var(--text-primary)] dark:bg-white/10 dark:hover:bg-white/15 cursor-pointer"
    type="button"
    :aria-label="ariaLabel"
    @click="toggleLocale"
  >
    <Languages class="size-4" aria-hidden="true" />
    <span class="inline-flex items-center gap-1">
      <span :class="locale === 'id' ? 'text-[var(--text-primary)] font-extrabold' : 'opacity-60 font-medium'">ID</span>
      <span class="opacity-30">|</span>
      <span :class="locale === 'en' ? 'text-[var(--text-primary)] font-extrabold' : 'opacity-60 font-medium'">EN</span>
    </span>
  </button>
</template>
