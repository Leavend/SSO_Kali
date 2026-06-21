<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Activity, AlertTriangle, FileText, Gauge, GitBranch, RefreshCw, Server } from 'lucide-vue-next'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useDateFormat } from '@/composables/useDateFormat'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import { useObservabilityStore } from '../stores/observability.store'
import type { ObservabilityLogEvent, ObservabilityService } from '../types'

const store = useObservabilityStore()
const dateFormat = useDateFormat()
const activeTab = ref<'metrics' | 'logs' | 'traces'>('metrics')

useAutoRefresh({
  intervalMs: 15000,
  task: () => store.refresh(),
  enabled: () => store.status !== 'forbidden' && store.status !== 'unauthenticated',
})

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

const summary = computed(() => store.summary)
const services = computed(() => summary.value?.services ?? [])
const logs = computed(() => summary.value?.logs ?? [])
const traces = computed(() => summary.value?.traces ?? null)
const degradedCopy = computed(() => (summary.value?.degraded ?? []).join(', '))
const healthyCount = computed(() => services.value.filter((service) => service.status === 'healthy').length)

function statusLabel(status: string): string {
  if (status === 'healthy') return 'Healthy'
  if (status === 'degraded') return 'Degraded'
  if (status === 'down') return 'Down'
  return 'Unknown'
}

function serviceTone(status: string): string {
  if (status === 'healthy') return 'observability-status--healthy'
  if (status === 'degraded') return 'observability-status--warning'
  if (status === 'down') return 'observability-status--danger'
  return 'observability-status--unknown'
}

function metricValue(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '-'
  return `${value}${suffix}`
}

function freshnessLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'instrumentation pending'
  return `${seconds}s freshness`
}

function logReference(log: ObservabilityLogEvent): string {
  return log.reference ?? formatTechnicalPreview(log.id)
}

function serviceQueue(service: ObservabilityService): string | null {
  const queue = service.queue
  if (!queue) return null
  return `${queue.pending_jobs} pending / ${queue.failed_jobs} failed`
}
</script>

<template>
  <section class="audit-page observability-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="observability-title">
    <header class="observability-hero">
      <div class="observability-hero__copy">
        <p class="eyebrow">SSO Observability</p>
        <h1 id="observability-title">Metrics, Logs, Traces</h1>
        <p>
          Cockpit operasional real-time untuk SSO-Backend, SSO-Portal, dan Admin-SSO.
          Data disajikan lewat admin API aman tanpa membuka token internal metrics ke browser.
        </p>
      </div>
      <div class="observability-hero__actions">
        <RouterLink class="ui-action ui-action--secondary" :to="{ name: 'admin.audit.compliance' }">
          Compliance evidence
        </RouterLink>
        <UiButton variant="primary" :disabled="store.status === 'loading'" @click="store.load()">
          <RefreshCw class="size-4 mr-1" :class="{ 'animate-spin': store.status === 'loading' }" />
          Refresh
        </UiButton>
      </div>
    </header>

    <UiSkeleton v-if="store.isLoading" :rows="6" label="Loading observability cockpit" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Observability"
      title="Observability access denied"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat observability cockpit.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="Observability cockpit belum bisa dimuat"
      :description="store.errorMessage ?? 'Coba muat ulang atau gunakan request ID untuk investigasi.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else-if="summary" class="observability-workspace">
      <section class="observability-health-strip" aria-label="Service health summary">
        <div>
          <span class="observability-health-strip__value">{{ healthyCount }}/{{ services.length }}</span>
          <span class="observability-health-strip__label">services healthy</span>
        </div>
        <div>
          <span class="observability-health-strip__value">{{ dateFormat.smart(summary.generated_at) }}</span>
          <span class="observability-health-strip__label">last snapshot</span>
        </div>
        <div>
          <span class="observability-health-strip__value">{{ summary.partial ? 'Partial' : 'Complete' }}</span>
          <span class="observability-health-strip__label">data quality</span>
        </div>
      </section>

      <p v-if="summary.partial" class="observability-degraded" role="status">
        <AlertTriangle class="size-4" />
        Partial telemetry: {{ degradedCopy }}
      </p>

      <section class="observability-service-grid" aria-label="SSO services">
        <article v-for="service in services" :key="service.key" class="observability-service-card">
          <div class="observability-service-card__header">
            <div class="observability-service-card__icon"><Server class="size-5" /></div>
            <div>
              <h2>{{ service.name }}</h2>
              <span class="observability-status" :class="serviceTone(service.status)">
                {{ statusLabel(service.status) }}
              </span>
            </div>
          </div>
          <p>{{ service.summary }}</p>
          <dl class="observability-metric-row">
            <div>
              <dt>p95</dt>
              <dd>{{ metricValue(service.latency_p95_ms, 'ms') }}</dd>
            </div>
            <div>
              <dt>rate</dt>
              <dd>{{ metricValue(service.request_rate_per_min, '/m') }}</dd>
            </div>
            <div>
              <dt>error</dt>
              <dd>{{ metricValue(service.error_rate_percent, '%') }}</dd>
            </div>
          </dl>
          <p class="observability-card-note">
            {{ serviceQueue(service) ?? freshnessLabel(service.freshness_seconds) }}
          </p>
        </article>
      </section>

      <nav class="observability-tabs" aria-label="Observability signals">
        <button type="button" :class="{ 'is-active': activeTab === 'metrics' }" @click="activeTab = 'metrics'">
          <Gauge class="size-4" /> Metrics
        </button>
        <button type="button" :class="{ 'is-active': activeTab === 'logs' }" @click="activeTab = 'logs'">
          <FileText class="size-4" /> Logs
        </button>
        <button type="button" :class="{ 'is-active': activeTab === 'traces' }" @click="activeTab = 'traces'">
          <GitBranch class="size-4" /> Traces
        </button>
      </nav>

      <section v-if="activeTab === 'metrics'" class="observability-panel" aria-labelledby="metrics-title">
        <div class="observability-panel__heading">
          <Activity class="size-5" />
          <h2 id="metrics-title">Runtime metrics</h2>
        </div>
        <div class="observability-signal-grid">
          <div class="observability-signal-card">
            <span>Auth events 15m</span>
            <strong>{{ summary.metrics.auth_funnel?.total_15m ?? 0 }}</strong>
            <small>{{ summary.metrics.auth_funnel?.failure_rate_percent ?? 0 }}% failed</small>
          </div>
          <div class="observability-signal-card">
            <span>Admin events 15m</span>
            <strong>{{ summary.metrics.admin_activity?.total_15m ?? 0 }}</strong>
            <small>{{ summary.metrics.admin_activity?.denied_rate_percent ?? 0 }}% denied</small>
          </div>
          <div class="observability-signal-card">
            <span>Queue pending</span>
            <strong>{{ summary.metrics.queue?.pending_jobs ?? 0 }}</strong>
            <small>{{ summary.metrics.queue?.failed_jobs ?? 0 }} failed jobs</small>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'logs'" class="observability-panel" aria-labelledby="logs-title">
        <div class="observability-panel__heading">
          <FileText class="size-5" />
          <h2 id="logs-title">Recent correlated events</h2>
        </div>
        <div class="observability-log-list">
          <article v-for="log in logs" :key="`${log.service}-${log.id ?? log.occurred_at}`" class="observability-log-row">
            <span class="observability-status" :class="log.severity === 'warning' ? 'observability-status--warning' : 'observability-status--healthy'">
              {{ log.severity }}
            </span>
            <div>
              <strong>{{ log.message }}</strong>
              <p>{{ log.service }} · {{ logReference(log) }} · {{ log.occurred_at ? dateFormat.smart(log.occurred_at) : '-' }}</p>
            </div>
          </article>
          <p v-if="logs.length === 0" class="observability-empty">No correlated events in the current snapshot.</p>
        </div>
      </section>

      <section v-else class="observability-panel" aria-labelledby="traces-title">
        <div class="observability-panel__heading">
          <GitBranch class="size-5" />
          <h2 id="traces-title">Distributed traces</h2>
        </div>
        <div class="observability-trace-state">
          <span class="observability-status observability-status--unknown">{{ traces?.status ?? 'unavailable' }}</span>
          <p>{{ traces?.reason }}</p>
          <strong>{{ traces?.next_step }}</strong>
        </div>
      </section>
    </div>

    <EvidenceContextPanel title="Observability evidence" :request-id="store.requestId" />
  </section>
</template>

<style scoped>
.observability-page {
  color: hsl(var(--foreground));
}

.observability-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.observability-hero__copy {
  max-width: 760px;
}

.observability-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0;
}

.observability-hero p:not(.eyebrow) {
  margin-top: 0.75rem;
  color: hsl(var(--muted-foreground));
  line-height: 1.7;
}

.observability-hero__actions,
.observability-tabs,
.observability-panel__heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.observability-workspace {
  display: grid;
  gap: 1rem;
}

.observability-health-strip,
.observability-service-grid,
.observability-signal-grid {
  display: grid;
  gap: 1rem;
}

.observability-health-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 1rem;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}

.observability-health-strip__value {
  display: block;
  font-weight: 900;
  font-size: 1.1rem;
}

.observability-health-strip__label,
.observability-card-note,
.observability-log-row p,
.observability-signal-card small {
  color: hsl(var(--muted-foreground));
  font-size: 0.82rem;
}

.observability-degraded {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #f59e0b55;
  background: #fffbeb;
  color: #92400e;
  font-weight: 700;
}

.observability-service-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.observability-service-card,
.observability-panel,
.observability-signal-card,
.observability-log-row,
.observability-trace-state {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}

.observability-service-card {
  padding: 1rem;
  display: grid;
  gap: 0.875rem;
  min-width: 0;
}

.observability-service-card__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.observability-service-card__icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.observability-service-card h2,
.observability-panel h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
}

.observability-service-card p {
  margin: 0;
  color: hsl(var(--muted-foreground));
  line-height: 1.55;
}

.observability-status {
  display: inline-flex;
  align-items: center;
  width: max-content;
  min-height: 1.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.observability-status--healthy {
  color: #047857;
  background: #d1fae5;
}

.observability-status--warning {
  color: #92400e;
  background: #fef3c7;
}

.observability-status--danger {
  color: #b91c1c;
  background: #fee2e2;
}

.observability-status--unknown {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}

.observability-metric-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.observability-metric-row div {
  padding: 0.625rem;
  border-radius: 8px;
  background: hsl(var(--muted));
}

.observability-metric-row dt {
  color: hsl(var(--muted-foreground));
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.observability-metric-row dd {
  margin: 0.25rem 0 0;
  font-size: 1.1rem;
  font-weight: 900;
}

.observability-tabs {
  overflow-x: auto;
  padding: 0.25rem;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--muted));
}

.observability-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.25rem;
  padding: 0 0.875rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-weight: 800;
  cursor: pointer;
}

.observability-tabs button.is-active {
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.08);
}

.observability-panel {
  padding: 1rem;
}

.observability-panel__heading {
  margin-bottom: 1rem;
}

.observability-signal-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.observability-signal-card {
  padding: 1rem;
}

.observability-signal-card span,
.observability-signal-card strong,
.observability-signal-card small {
  display: block;
}

.observability-signal-card span {
  color: hsl(var(--muted-foreground));
  font-weight: 800;
}

.observability-signal-card strong {
  margin-top: 0.25rem;
  font-size: 2rem;
  font-weight: 950;
}

.observability-log-list {
  display: grid;
  gap: 0.75rem;
}

.observability-log-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
  padding: 0.875rem;
}

.observability-log-row strong,
.observability-log-row p {
  overflow-wrap: anywhere;
}

.observability-log-row p {
  margin: 0.25rem 0 0;
}

.observability-empty {
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.observability-trace-state {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}

.observability-trace-state p,
.observability-trace-state strong {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .observability-hero,
  .observability-hero__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .observability-service-grid,
  .observability-health-strip,
  .observability-signal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
