<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useDashboardSummary } from '@/composables/useDashboardSummary'
import { resolveCounterTone } from '@/lib/dashboard/dashboard-view-state'
import { DASHBOARD_GROUP_KEYS, type DashboardGroupKey } from '@/types/dashboard.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import DashboardMetricGroup, {
  type DashboardMetricRow,
} from '@/components/dashboard/DashboardMetricGroup.vue'

definePageMeta({
  name: 'admin.dashboard',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw government PII
// stay in Nitro event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-dashboard-principal', () => store.ensureSession())

// SAFE DATA: the summary is fetched through a service (no direct fetch in the
// page). The DTO is aggregate counters + a timestamp only — no secret, token, or
// raw PII — so it is safe to serialize into the SSR payload.
const { summary, viewState, requestId, degraded, isStale, refresh } = useDashboardSummary()

function groupTitle(group: DashboardGroupKey): string {
  const path = `dashboard.counters.${group}.title`
  const translated = t(path)
  return translated === path ? group : translated
}

function counterLabel(group: DashboardGroupKey, key: string): string {
  const path = `dashboard.counters.${group}.${key}`
  const translated = t(path)
  return translated === path ? key.replace(/_/gu, ' ') : translated
}

const groups = computed(() => {
  const counters = summary.value?.counters
  if (!counters) return []
  return DASHBOARD_GROUP_KEYS.map((group) => ({
    key: group,
    caption: groupTitle(group),
    rows: Object.entries(counters[group]).map(
      ([key, value]): DashboardMetricRow => ({
        id: `${group}.${key}`,
        label: counterLabel(group, key),
        value,
        tone: resolveCounterTone(key, value),
      }),
    ),
  }))
})

const degradedLabel = computed<string>(() =>
  degraded.value.map((group) => groupTitle(group as DashboardGroupKey)).join(', '),
)

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="dashboard" data-page="dashboard">
    <header class="dashboard__hero">
      <span class="dashboard__eyebrow">{{ t('dashboard.eyebrow') }}</span>
      <h1 class="dashboard__title">{{ t('dashboard.title') }}</h1>
      <p class="dashboard__summary">{{ t('dashboard.summary') }}</p>
      <p class="dashboard__principal" data-principal-name>
        {{ t('dashboard.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <dl v-if="summary" class="dashboard__evidence">
        <dt>{{ t('dashboard.generated_at') }}</dt>
        <dd><UiFolio :value="summary.generated_at" variant="timestamp" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('dashboard.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('dashboard.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('dashboard.eyebrow')"
      :title="t('dashboard.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('dashboard.empty_title')"
      :description="t('dashboard.empty_description')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="(summary && summary.partial) || isStale" class="dashboard__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span v-if="summary && summary.partial">
          {{ t('dashboard.degraded_banner', { groups: degradedLabel }) }}
        </span>
        <span v-else>{{ t('dashboard.stale_banner') }}</span>
      </div>

      <div class="dashboard__grid">
        <DashboardMetricGroup
          v-for="group in groups"
          :key="group.key"
          :caption="group.caption"
          :metric-label="t('dashboard.metric_label')"
          :count-label="t('dashboard.count_label')"
          :rows="group.rows"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.dashboard__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px;
  background: radial-gradient(circle at 95% 20%, rgba(79, 70, 229, 0.05), transparent 40%), var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.dashboard__hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--accent);
}
.dashboard__eyebrow {
  font: 700 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}
.dashboard__title {
  margin: 0;
  font: 800 1.75rem/1.2 var(--font-sans);
  letter-spacing: -0.025em;
  color: var(--fg);
}
.dashboard__summary {
  margin: 4px 0 0;
  max-width: 68ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.dashboard__principal {
  margin: 8px 0 0;
  font: 600 0.775rem/1.5 var(--font-sans);
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 4px 12px;
  border-radius: var(--r-full);
  width: fit-content;
}
.dashboard__evidence {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.dashboard__evidence dt {
  font: 700 0.65rem/1 var(--font-sans);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.dashboard__evidence dd {
  margin: 0;
}
.dashboard__banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
.dashboard__grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
</style>
