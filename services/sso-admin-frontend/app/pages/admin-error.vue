<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({
  name: 'admin.error',
  layout: false,
})

// Absolute escape to the SSO portal so an admin is not trapped on this origin.
const config = useRuntimeConfig()
const portalUrl = computed(() => {
  const base = (config.public.ssoBaseUrl ?? '').replace(/\/$/u, '')
  return base ? `${base}/home` : '/'
})
</script>

<template>
  <main class="standalone">
    <h1>Something went wrong</h1>
    <p>The admin console hit an unexpected error.</p>
    <a :href="portalUrl">Back to SSO Portal</a>
  </main>
</template>

<style scoped>
.standalone {
  display: grid;
  gap: 12px;
  max-width: 32rem;
  margin: 12vh auto;
  padding: 24px;
  font: 400 0.9375rem/1.5 var(--font-sans);
}
.standalone h1 {
  font: 600 1.5rem/1.2 var(--font-sans);
}
.standalone a {
  color: var(--accent);
  text-decoration: underline;
}
</style>
