<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'

const { locale, t, setLocale } = useI18n()

function toggleLocale() {
  const nextLocale = locale.value === 'id' ? 'en' : 'id'
  setLocale(nextLocale)
  if (
    typeof window !== 'undefined' &&
    window.location &&
    typeof window.location.reload === 'function'
  ) {
    window.location.reload()
  }
}
</script>

<template>
  <button
    class="admin-locale-switcher"
    type="button"
    :aria-label="t('language.label')"
    @click="toggleLocale"
  >
    <div class="admin-locale-switcher__content">
      <span class="admin-locale-label">{{ t('language.label') }}</span>
      <span class="admin-locale-selected">
        {{ locale.toUpperCase() }}
      </span>
    </div>
  </button>
</template>
