<script setup lang="ts">
import { computed, onMounted } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
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

const hasCounterValues = computed(() =>
  cards.value.some((card) => Object.values(card.counters).length > 0),
)

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
      </dl>
    </header>

    <UiSkeleton
      v-if="dashboard.status === 'loading' || dashboard.status === 'idle'"
      :rows="6"
      label="Memuat dashboard admin"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Dashboard"
      title="Akses dashboard ditolak"
      :description="dashboard.errorMessage ?? 'Backend menolak akses dashboard admin.'"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'unauthenticated'"
      tone="step_up"
      eyebrow="Sesi admin"
      title="Sesi admin berakhir"
      :description="dashboard.errorMessage ?? 'Sesi admin tidak lagi valid.'"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'error'"
      tone="error"
      eyebrow="Dashboard"
      title="Dashboard admin belum bisa dimuat"
      :description="dashboard.errorMessage ?? 'Admin API belum bisa memuat summary dashboard.'"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasCounterValues"
      title="Dashboard belum memiliki evidence"
      description="Belum ada ringkasan dashboard untuk ditampilkan. Refresh data atau cek permission backend bila kondisi ini tidak sesuai."
    >
      <template #action>
        <button class="ui-action ui-action--secondary" type="button" @click="void dashboard.load()">
          Refresh
        </button>
      </template>
    </UiEmptyState>

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

    <EvidenceContextPanel title="Dashboard evidence" :request-id="dashboard.requestId" />
  </section>
</template>
