<script setup lang="ts">
import { useI18n, type SupportedLocale } from '@/composables/useI18n'

const { availableLocales, locale, setLocale, t } = useI18n()

function selectLocale(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as SupportedLocale)
}
</script>

<template>
  <label class="admin-locale-switcher">
    <span>{{ t('language.label') }}</span>
    <select :aria-label="t('language.label')" :value="locale" @change="selectLocale">
      <option v-for="item in availableLocales" :key="item" :value="item">
        {{ t(`language.${item}`) }}
      </option>
    </select>
  </label>
</template>
