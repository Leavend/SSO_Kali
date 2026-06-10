<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { getAdminEnvironment } from '@/config/adminEnvironment'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useDashboardStore } from '../stores/dashboard.store'
import type { DashboardCounterGroup } from '../types'
import { Users, Activity, AppWindow, FileSearch, ShieldAlert, Inbox } from 'lucide-vue-next'

const dashboard = useDashboardStore()
const { t } = useI18n()
const dateFormat = useDateFormat()

const env = getAdminEnvironment()
const pollInterval = env.VITE_ADMIN_DASHBOARD_POLL_MS
  ? Number(env.VITE_ADMIN_DASHBOARD_POLL_MS)
  : 30000

useAutoRefresh({
  intervalMs: pollInterval,
  task: () => dashboard.refresh(),
  enabled: () => dashboard.status !== 'forbidden' && dashboard.status !== 'unauthenticated',
})

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

const cardIcons: Record<string, any> = {
  Users: Users,
  Sessions: Activity,
  Clients: AppWindow,
  Audit: FileSearch,
  Incidents: ShieldAlert,
  DSR: Inbox,
}

const hasCounterValues = computed(() =>
  cards.value.some((card) => Object.values(card.counters).length > 0),
)

onMounted(() => {
  if (dashboard.status === 'idle') void dashboard.load()
})

function entries(counters: DashboardCounterGroup): readonly [string, number][] {
  return Object.entries(counters)
}

function cardTitle(title: string): string {
  const map: Record<string, string> = {
    Users: 'dashboard.counters.users.title',
    Sessions: 'dashboard.counters.sessions.title',
    Clients: 'dashboard.counters.clients.title',
    Audit: 'dashboard.counters.audit.title',
    Incidents: 'dashboard.counters.incidents.title',
    DSR: 'dashboard.counters.data_subject_requests.title',
  }
  const path = map[title]
  if (!path) return title
  return t(path)
}

function counterLabel(title: string, key: string): string {
  const map: Record<string, string> = {
    Users: 'users',
    Sessions: 'sessions',
    Clients: 'clients',
    Audit: 'audit',
    Incidents: 'incidents',
    DSR: 'data_subject_requests',
  }
  const group = map[title]
  if (!group) return key.replace(/_/gu, ' ')

  const path = `dashboard.counters.${group}.${key}`
  const translation = t(path)
  return translation === path ? key.replace(/_/gu, ' ') : translation
}

function counterTone(key: string, value: number): 'neutral' | 'success' | 'warning' | 'danger' {
  if (value === 0) return 'neutral'
  const k = key.toLowerCase()

  if (
    k.includes('denied') ||
    k.includes('locked') ||
    k.includes('rejected') ||
    k.includes('disabled') ||
    k.includes('deactivated')
  ) {
    return 'danger'
  }
  if (k.includes('staged') || k.includes('hold')) {
    return 'warning'
  }
  if (k.includes('active') || k.includes('fulfilled') || k.includes('approved')) {
    return 'success'
  }
  return 'neutral'
}
</script>

<template>
  <section class="dashboard-page">
    <header class="hero-card dashboard-hero">
      <span class="eyebrow">{{ t('dashboard.eyebrow') }}</span>
      <h1>{{ t('dashboard.title') }}</h1>
      <p>{{ t('dashboard.summary') }}</p>

      <dl class="dashboard-evidence">
        <div v-if="dashboard.summary">
          <dt>Generated at</dt>
          <dd :title="dateFormat.iso(dashboard.summary.generated_at)">
            {{ dateFormat.smart(dashboard.summary.generated_at) }}
          </dd>
        </div>
      </dl>
    </header>

    <UiSkeleton
      v-if="dashboard.status === 'loading' || dashboard.status === 'idle'"
      :rows="6"
      :label="t('dashboard.loading')"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Dashboard"
      :title="t('dashboard.forbidden_title')"
      :description="dashboard.errorMessage ?? t('common.forbidden_desc')"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'unauthenticated'"
      tone="step_up"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="dashboard.errorMessage ?? t('common.session_expired_desc')"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="dashboard.status === 'error'"
      tone="error"
      eyebrow="Dashboard"
      :title="t('dashboard.error_title')"
      :description="dashboard.errorMessage ?? t('common.error_loading_desc')"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasCounterValues"
      :title="t('dashboard.empty_title')"
      :description="t('dashboard.empty_description')"
    >
      <template #action>
        <button class="ui-action ui-action--secondary" type="button" @click="void dashboard.load()">
          {{ t('common.btn_refresh') }}
        </button>
      </template>
    </UiEmptyState>

    <section v-else class="dashboard-grid" aria-label="Ringkasan dashboard admin">
      <article
        v-for="card in cards"
        :key="card.title"
        class="dashboard-card"
        :class="`dashboard-card--${card.title.toLowerCase()}`"
      >
        <div class="dashboard-card__header">
          <div class="dashboard-card__icon-wrapper">
            <component
              :is="cardIcons[card.title]"
              class="dashboard-card__icon"
              :size="18"
              aria-hidden="true"
            />
          </div>
          <h2>{{ cardTitle(card.title) }}</h2>
        </div>
        <dl>
          <div v-for="[key, value] in entries(card.counters)" :key="key">
            <dt>{{ counterLabel(card.title, key) }}</dt>
            <dd
              class="dashboard-counter-value"
              :class="`dashboard-counter-value--${counterTone(key, value)}`"
            >
              {{ value }}
            </dd>
          </div>
        </dl>
      </article>
    </section>

    <EvidenceContextPanel title="Dashboard evidence" :request-id="dashboard.requestId" />
  </section>
</template>
