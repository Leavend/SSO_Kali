<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  collapsed?: boolean
}>()

const { locale, t, setLocale } = useI18n()

const ariaLabel = computed<string>(() =>
  locale.value === 'id' ? t('language.switch_to_en') : t('language.switch_to_id'),
)

async function toggleLocale(): Promise<void> {
  const nextLocale = locale.value === 'id' ? 'en' : 'id'
  await setLocale(nextLocale)
}
</script>

<template>
  <button class="admin-locale-switcher" type="button" :aria-label="ariaLabel" @click="toggleLocale">
    <template v-if="collapsed">
      <span class="admin-locale-selected">{{ locale.toUpperCase() }}</span>
    </template>
    <template v-else>
      <span :class="{ 'admin-locale-selected': locale === 'id' }">ID</span>
      <span class="admin-locale-divider" aria-hidden="true">|</span>
      <span :class="{ 'admin-locale-selected': locale === 'en' }">EN</span>
    </template>
  </button>
</template>

<style scoped>
.admin-locale-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--fg-3);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.admin-locale-switcher:hover {
  background: var(--muted);
}
.admin-locale-switcher:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.admin-locale-selected {
  color: var(--fg);
  font-weight: 600;
}
.admin-locale-divider {
  color: var(--border-strong);
}
</style>
