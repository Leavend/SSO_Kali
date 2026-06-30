<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({
  name: 'admin.forbidden',
  layout: false,
})

// Absolute escape to the SSO portal so an admin who lacks access is not trapped
// on this origin (a relative URL would dead-end them here).
const config = useRuntimeConfig()
const portalUrl = computed(() => {
  const base = (config.public.ssoBaseUrl ?? '').replace(/\/$/u, '')
  return base ? `${base}/home` : '/'
})
</script>

<template>
  <main class="standalone">
    <h1>Access denied</h1>
    <p>This account does not have admin access.</p>
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
