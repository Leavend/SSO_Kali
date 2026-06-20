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
