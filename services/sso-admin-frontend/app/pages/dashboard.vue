<script setup lang="ts">
import { useSessionStore } from '@/stores/session.store'

definePageMeta({
  name: 'admin.dashboard',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw government PII
// stay in Nitro event.context and are never written to useState / the __NUXT__
// payload. useAsyncData runs the resolve during SSR (no client bootstrap flash)
// and serializes only its result string plus the masked principal — all safe.
const store = useSessionStore()
await useAsyncData('admin-dashboard-principal', () => store.ensureSession())
</script>

<template>
  <section data-page="dashboard">
    <h1>Dashboard</h1>
    <p data-principal-name>Signed in as {{ store.principal?.display_name ?? '—' }}</p>
  </section>
</template>
