<script setup lang="ts">
import ScrollToTop from '@/components/ScrollToTop.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

withDefaults(
  defineProps<{
    admin?: boolean
  }>(),
  {
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
      v-if="!admin"
      id="devsso-theme-float"
      class="theme-toggle-anchor"
    >
      <ThemeToggle />
    </div>
    <ScrollToTop />
  </div>
</template>
