<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDashboardStore } from '../stores/dashboard.store'
import type { DashboardCounterGroup } from '../types'

const dashboard = useDashboardStore()

const cards = computed(() => {
  const counters = dashboard.summary?.counters
  if (!counters) return []

  return [
    { title: 'Users', counters: counters.users },
    { title: 'Sessions', counters: counters.sessions },
    { title: 'Clients', counters: counters.clients },
    { title: 'Audit', counters: counters.audit },
    { title: 'Incidents', counters: counters.incidents },
    { title: 'DSR', counters: counters.data_subject_requests },
  ]
})

onMounted(() => {
  if (dashboard.status === 'idle') void dashboard.load()
})

function entries(counters: DashboardCounterGroup): readonly [string, number][] {
  return Object.entries(counters)
}

function label(value: string): string {
  return value.replace(/_/gu, ' ')
}
</script>

<template>
  <section class="dashboard-page">
    <header class="hero-card dashboard-hero">
      <span class="eyebrow">Admin Governance</span>
      <h1>Admin Dashboard</h1>
      <p>
        Ringkasan read-only untuk users, sessions, clients, audit, incidents, dan DSR. Backend tetap
        menjadi security boundary.
      </p>
      <dl class="dashboard-evidence">
        <div v-if="dashboard.summary">
          <dt>Generated at</dt>
          <dd>{{ dashboard.summary.generated_at }}</dd>
        </div>
        <div v-if="dashboard.requestId">
          <dt>Request ID</dt>
          <dd class="break-anywhere">{{ dashboard.requestId }}</dd>
        </div>
      </dl>
    </header>

    <section
      v-if="dashboard.status === 'loading' || dashboard.status === 'idle'"
      class="oidc-panel"
      aria-live="polite"
    >
      <h2>Memuat dashboard admin</h2>
      <p>Mengambil governance summary dari admin API.</p>
    </section>

    <section v-else-if="dashboard.status === 'forbidden'" class="oidc-panel" role="alert">
      <h2>Akses dashboard ditolak</h2>
      <p>{{ dashboard.errorMessage }}</p>
    </section>

    <section v-else-if="dashboard.status === 'unauthenticated'" class="oidc-panel" role="alert">
      <h2>Sesi admin berakhir</h2>
      <p>{{ dashboard.errorMessage }}</p>
    </section>

    <section v-else-if="dashboard.status === 'error'" class="oidc-panel" role="alert">
      <h2>Dashboard admin belum bisa dimuat</h2>
      <p>{{ dashboard.errorMessage }}</p>
    </section>

    <section v-else class="dashboard-grid" aria-label="Ringkasan dashboard admin">
      <article v-for="card in cards" :key="card.title" class="dashboard-card">
        <h2>{{ card.title }}</h2>
        <dl>
          <div v-for="[key, value] in entries(card.counters)" :key="key">
            <dt>{{ label(key) }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
      </article>
    </section>
  </section>
</template>
