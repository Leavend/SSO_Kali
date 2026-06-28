<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useObservabilitySummary } from '@/composables/useObservabilitySummary'
import type { StatusTone } from '@/lib/status-tone'
import type { ObservabilityQueue } from '@/types/observability.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import ObservabilityServiceList from '@/components/observability/ObservabilityServiceList.vue'
import ObservabilityLogList from '@/components/observability/ObservabilityLogList.vue'
import DashboardMetricGroup, {
  type DashboardMetricRow,
} from '@/components/dashboard/DashboardMetricGroup.vue'

definePageMeta({
  name: 'admin.observability',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.observability.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store
// (display name, role, capability flags only). OIDC tokens + raw government PII
// stay in Nitro event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-observability-principal', () => store.ensureSession())

// SAFE DATA: the summary is fetched through observabilityApi (no direct fetch in
// the page). The DTO is masked aggregates + timestamps only — no secret, token,
// or raw PII — so it is safe to serialize into the SSR payload.
const { summary, viewState, requestId, degraded, isStale, refresh } = useObservabilitySummary()

const humanize = (key: string): string => key.replace(/_/gu, ' ')

function metricTone(key: string, value: number | null): StatusTone {
  if (value === null || value === 0) return 'neutral'
  if (/failed|denied|error/u.test(key)) return 'danger'
  if (/pending|on_hold|stale/u.test(key)) return 'warning'
  return 'neutral'
}

function rowsFromRecord(
  record: Readonly<Record<string, number>> | undefined,
): DashboardMetricRow[] {
  if (!record) return []
  return Object.entries(record).map(
    ([key, value]): DashboardMetricRow => ({
      id: key,
      label: humanize(key),
      value,
      tone: metricTone(key, value),
    }),
  )
}

function rowsFromQueue(queue: ObservabilityQueue | undefined): DashboardMetricRow[] {
  if (!queue) return []
  return [
    {
      id: 'pending_jobs',
      label: humanize('pending_jobs'),
      value: queue.pending_jobs,
      tone: metricTone('pending_jobs', queue.pending_jobs),
    },
    {
      id: 'failed_jobs',
      label: humanize('failed_jobs'),
      value: queue.failed_jobs,
      tone: metricTone('failed_jobs', queue.failed_jobs),
    },
    {
      id: 'oldest_pending_age_seconds',
      label: humanize('oldest_pending_age_seconds'),
      value: queue.oldest_pending_age_seconds,
      tone: 'neutral',
    },
  ]
}

const metricGroups = computed(() => {
  const metrics = summary.value?.metrics
  if (!metrics) return []
  const groups: ReadonlyArray<{ key: string; caption: string; rows: DashboardMetricRow[] }> = [
    {
      key: 'auth',
      caption: t('observability.metrics_auth'),
      rows: rowsFromRecord(metrics.auth_funnel),
    },
    {
      key: 'admin',
      caption: t('observability.metrics_admin'),
      rows: rowsFromRecord(metrics.admin_activity),
    },
    { key: 'queue', caption: t('observability.metrics_queue'), rows: rowsFromQueue(metrics.queue) },
  ]
  return groups.filter((group) => group.rows.length > 0)
})

const degradedLabel = computed<string>(() => degraded.value.map(humanize).join(', '))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="observability" data-page="observability">
    <header class="observability__hero">
      <span class="observability__eyebrow">{{ t('observability.eyebrow') }}</span>
      <h1 class="observability__title">{{ t('observability.title') }}</h1>
      <p class="observability__summary">{{ t('observability.summary') }}</p>
      <p class="observability__principal" data-principal-name>
        {{ t('observability.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <NuxtLink
        v-if="store.hasPermission('admin.observability.read')"
        :to="{ name: 'admin.observability.compliance' }"
        class="observability__crosslink"
        data-compliance-link
      >
        {{ t('observability.compliance_link') }}
      </NuxtLink>
      <dl v-if="summary" class="observability__evidence">
        <dt>{{ t('observability.generated_at') }}</dt>
        <dd><UiFolio :value="summary.generated_at" variant="timestamp" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('observability.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('observability.eyebrow')"
      :title="t('observability.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('observability.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('observability.eyebrow')"
      :title="t('observability.error_title')"
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
      :title="t('observability.empty_title')"
      :description="t('observability.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else-if="summary">
      <div v-if="summary.partial || isStale" class="observability__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span v-if="summary.partial">
          {{ t('observability.degraded_banner', { sections: degradedLabel }) }}
        </span>
        <span v-else>{{ t('observability.stale_banner') }}</span>
      </div>

      <ObservabilityServiceList
        :caption="t('observability.services_title')"
        :name-label="t('observability.service_name')"
        :status-label="t('observability.service_status')"
        :services="summary.services"
      />

      <div class="observability__grid">
        <DashboardMetricGroup
          v-for="group in metricGroups"
          :key="group.key"
          :caption="group.caption"
          :metric-label="t('observability.metric_label')"
          :count-label="t('observability.count_label')"
          :rows="group.rows"
        />
      </div>

      <ObservabilityLogList
        :caption="t('observability.logs_title')"
        :time-label="t('observability.log_time')"
        :message-label="t('observability.log_message')"
        :logs="summary.logs"
      />

      <section class="observability__traces" aria-labelledby="observability-traces">
        <h2 id="observability-traces" class="observability__section-title">
          {{ t('observability.traces_title') }}
        </h2>
        <UiStatusBadge :status="summary.traces.status" :label="summary.traces.status" />
        <p class="observability__traces-reason">{{ summary.traces.reason }}</p>
        <p v-if="summary.traces.next_step" class="observability__traces-next">
          {{ summary.traces.next_step }}
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.observability {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.observability__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.observability__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.observability__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.observability__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.observability__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.observability__crosslink {
  justify-self: start;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
  text-decoration: none;
}
.observability__crosslink:hover {
  text-decoration: underline;
}
.observability__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.observability__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.observability__evidence dd {
  margin: 0;
}
.observability__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
.observability__grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.observability__traces {
  display: grid;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.observability__section-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.observability__traces-reason {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.observability__traces-next {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
