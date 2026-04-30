<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import type { Theme } from '@parent-ui/auth-shell.mjs'

withDefaults(
  defineProps<{
    initialTheme?: Theme
    admin?: boolean
  }>(),
  {
    initialTheme: undefined,
    admin: false,
  },
)
</script>

<template>
  <div
    class="floating-actions"
    :class="{ 'floating-actions--admin': admin }"
    aria-label="Page actions"
  >
    <div
      id="devsso-theme-float"
      class="theme-toggle-anchor"
      :class="{ 'admin-theme-toggle-anchor': admin }"
    >
      <ThemeToggle :initial-theme="initialTheme" />
    </div>

    <ScrollToTop />
  </div>
</template>
