<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { locale, t, setLocale } = useI18n()

const ariaLabel = computed<string>(() =>
  locale.value === 'id' ? t('language.switch_to_en') : t('language.switch_to_id'),
)

function toggleLocale(): void {
  const nextLocale = locale.value === 'id' ? 'en' : 'id'
  setLocale(nextLocale)
}
</script>

<template>
  <button class="admin-locale-switcher" type="button" :aria-label="ariaLabel" @click="toggleLocale">
    <span :class="{ 'admin-locale-selected': locale === 'id' }">ID</span>
    <span class="admin-locale-divider" aria-hidden="true">|</span>
    <span :class="{ 'admin-locale-selected': locale === 'en' }">EN</span>
  </button>
</template>
