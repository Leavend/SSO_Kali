<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Activity,
  AlertTriangle,
  FileText,
  Gauge,
  GitBranch,
  RefreshCw,
  Server,
  Clock,
  Shield,
  CheckCircle2,
  XCircle,
  Database,
  ArrowRight,
  Terminal,
  Cpu,
  Layers
} from 'lucide-vue-next'
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

// Compute values for SVG circular meters
const authFailureRate = computed(() => summary.value?.metrics.auth_funnel?.failure_rate_percent ?? 0)
const adminDeniedRate = computed(() => summary.value?.metrics.admin_activity?.denied_rate_percent ?? 0)

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
  if (seconds === 0) return 'live'
  return `${seconds}s freshness`
}

function metricsFreshnessLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'cached telemetry snapshot'
  if (seconds === 0) return 'live'
  return `refreshed about every ${seconds}s`
}

function recentEventsFreshnessLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'snapshot refresh pending'
  if (seconds === 0) return 'live'
  return `refreshed about every ${seconds}s`
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
  <section class="observability-page-wrapper max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="observability-title">

    <!-- Hero / Header Section -->
    <header class="observability-hero-card">
      <div class="observability-hero-card__glow"></div>
      <div class="observability-hero-card__content">
        <div class="observability-hero-card__copy">
          <span class="premium-eyebrow">
            <Cpu class="size-3.5 animate-pulse" />
            SSO Observability Control
          </span>
          <h1 id="observability-title" class="premium-title">Metrics, Logs, Traces</h1>
          <p class="premium-subtitle">
            Real-time operations cockpit for SSO-Backend, SSO-Portal, and Admin-SSO.
            Telemetry is served securely via local backend credentials without exposing internal metrics tokens to the browser.
          </p>
        </div>
        <div class="observability-hero-card__actions">
          <RouterLink class="button button--secondary premium-action-btn" :to="{ name: 'admin.observability.compliance' }">
            <Shield class="size-4 mr-1.5" />
            Compliance evidence
          </RouterLink>
          <UiButton variant="primary" class="premium-action-btn shadow-indigo" :disabled="store.status === 'loading'" @click="store.load()">
            <RefreshCw class="size-4 mr-1.5" :class="{ 'animate-spin': store.status === 'loading' }" />
            Refresh
          </UiButton>
        </div>
      </div>
    </header>

    <UiSkeleton v-if="store.isLoading" :rows="6" class="mt-6" label="Loading observability cockpit" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Observability"
      title="Observability access denied"
      :description="store.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat observability cockpit.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
      class="mt-6"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      title="Sesi admin berakhir"
      :description="store.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
      class="mt-6"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      title="Observability cockpit belum bisa dimuat"
      :description="store.errorMessage ?? 'Coba muat ulang atau gunakan request ID untuk investigasi.'"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
      class="mt-6"
    />

    <div v-else-if="summary" class="observability-workspace mt-8">
      <div v-if="store.isStale" class="observability-degraded-banner mb-4" role="status">
        <AlertTriangle class="size-4" />
        <span>{{ store.errorMessage ?? 'Latest refresh failed. Showing the last successful telemetry snapshot.' }}</span>
      </div>

      <!-- System Health Top Stats -->
      <section class="observability-stats-grid" aria-label="Service health summary">
        <article class="observability-stat-card">
          <div class="observability-stat-card__icon bg-emerald-light">
            <Server class="size-5 text-emerald" />
          </div>
          <div class="observability-stat-card__content">
            <span class="observability-stat-card__label">System Health Status</span>
            <div class="observability-stat-card__value-wrapper">
              <span class="observability-stat-card__value text-emerald">{{ healthyCount }}/{{ services.length }}</span>
              <span class="observability-stat-card__value-desc">active nodes online</span>
            </div>
            <div class="observability-stat-card__bar mt-2">
              <div class="observability-stat-card__bar-fill bg-emerald-bar" :style="{ width: `${(healthyCount / services.length) * 100}%` }"></div>
            </div>
          </div>
        </article>

        <article class="observability-stat-card">
          <div class="observability-stat-card__icon bg-blue-light">
            <Clock class="size-5 text-blue" />
          </div>
          <div class="observability-stat-card__content">
            <span class="observability-stat-card__label">Last Telemetry Snapshot</span>
            <div class="observability-stat-card__value-wrapper">
              <span class="observability-stat-card__value text-blue">{{ dateFormat.smart(summary.generated_at) }}</span>
            </div>
            <span class="observability-stat-card__value-desc mt-2 block">15 seconds auto-refresh window</span>
          </div>
        </article>

        <article class="observability-stat-card">
          <div class="observability-stat-card__icon" :class="summary.partial ? 'bg-amber-light' : 'bg-indigo-light'">
            <Shield class="size-5" :class="summary.partial ? 'text-amber' : 'text-indigo'" />
          </div>
          <div class="observability-stat-card__content">
            <span class="observability-stat-card__label">Data Quality Integrity</span>
            <div class="observability-stat-card__value-wrapper">
              <span class="observability-stat-card__value" :class="summary.partial ? 'text-amber' : 'text-indigo'">
                {{ summary.partial ? 'Partial' : 'Complete' }}
              </span>
            </div>
            <span class="observability-stat-card__value-desc mt-2 block">
              {{ summary.partial ? 'Some metrics are currently degraded' : 'Telemetry aggregation fully intact' }}
            </span>
          </div>
        </article>
      </section>

      <!-- Degraded telemetry warnings -->
      <div v-if="summary.partial" class="observability-degraded-banner mt-4" role="status">
        <div class="observability-degraded-banner__indicator animate-pulse"></div>
        <AlertTriangle class="size-5 text-amber-banner" />
        <span class="observability-degraded-banner__text">
          <strong>Partial Telemetry Alert:</strong> The following collectors are returning degraded signals: {{ degradedCopy }}
        </span>
      </div>

      <!-- Services List Section -->
      <section class="observability-service-cards-grid mt-6" aria-label="SSO services">
        <article
          v-for="service in services"
          :key="service.key"
          class="observability-node-card"
          :class="`observability-node-card--${service.status}`"
        >
          <div class="observability-node-card__header">
            <div class="observability-node-card__title-area">
              <div class="observability-node-card__icon-box">
                <Server class="size-5 text-indigo-light-fg" />
              </div>
              <div>
                <h2 class="observability-node-card__title">{{ service.name }}</h2>
                <div class="observability-node-card__status-line mt-1">
                  <span class="pulse-dot" :class="`pulse-dot--${service.status}`"></span>
                  <span class="observability-node-card__status-text" :class="`text-status--${service.status}`">
                    {{ statusLabel(service.status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p class="observability-node-card__summary mt-3">{{ service.summary }}</p>

          <!-- System checks sub-badges if available -->
          <div v-if="service.checks && Object.keys(service.checks).length > 0" class="observability-node-card__checks mt-3">
            <span
              v-for="(val, checkName) in service.checks"
              :key="checkName"
              class="observability-node-card__check-badge"
              :class="val ? 'observability-node-card__check-badge--pass' : 'observability-node-card__check-badge--fail'"
            >
              <CheckCircle2 v-if="val" class="size-3.5 text-emerald" />
              <XCircle v-else class="size-3.5 text-rose" />
              {{ checkName }}
            </span>
          </div>

          <!-- Divider -->
          <div class="observability-node-card__divider my-4"></div>

          <!-- Service Metrics Cluster -->
          <dl class="observability-metrics-cluster">
            <div class="observability-metric-item">
              <dt class="observability-metric-item__title">P95 Latency</dt>
              <dd class="observability-metric-item__value">
                <span class="val">{{ metricValue(service.latency_p95_ms) }}</span>
                <span v-if="service.latency_p95_ms !== null && service.latency_p95_ms !== undefined" class="unit">ms</span>
              </dd>
            </div>
          </dl>

          <div class="observability-node-card__footer mt-4">
            <span class="observability-node-card__freshness">
              <Clock class="size-3.5 mr-1" />
              {{ serviceQueue(service) ?? freshnessLabel(service.freshness_seconds) }}
            </span>
          </div>
        </article>
      </section>

      <!-- Tabs Navigation Center -->
      <nav class="premium-tabs mt-8" aria-label="Observability signals">
        <div class="premium-tabs__wrapper">
          <button
            type="button"
            class="premium-tab-btn"
            :class="{ 'premium-tab-btn--active': activeTab === 'metrics' }"
            @click="activeTab = 'metrics'"
          >
            <Gauge class="size-4" />
            <span>Metrics</span>
          </button>

          <button
            type="button"
            class="premium-tab-btn"
            :class="{ 'premium-tab-btn--active': activeTab === 'logs' }"
            @click="activeTab = 'logs'"
          >
            <FileText class="size-4" />
            <span>Logs</span>
          </button>

          <button
            type="button"
            class="premium-tab-btn"
            :class="{ 'premium-tab-btn--active': activeTab === 'traces' }"
            @click="activeTab = 'traces'"
          >
            <GitBranch class="size-4" />
            <span>Traces</span>
          </button>
        </div>
      </nav>

      <!-- Tab View: Metrics -->
      <section v-if="activeTab === 'metrics'" class="observability-panel-card mt-4" aria-labelledby="metrics-title">
        <div class="observability-panel-card__header">
          <div class="observability-panel-card__title-box">
            <Activity class="size-5 text-indigo-light-fg" />
            <h2 id="metrics-title" class="observability-panel-card__title">Runtime metrics</h2>
          </div>
          <span class="observability-panel-card__subtitle">
            Aggregate 15-minute auth/admin windows, {{ metricsFreshnessLabel(summary.metrics.freshness_seconds) }}
          </span>
        </div>

        <div class="observability-signal-metrics-grid mt-6">

          <!-- Auth Funnel Widget -->
          <div class="observability-signal-widget">
            <div class="observability-signal-widget__gauge-area">
              <svg class="circular-progress" viewBox="0 0 100 100">
                <circle class="circular-progress__bg" cx="50" cy="50" r="40" />
                <circle
                  class="circular-progress__fill text-indigo-light-fg"
                  cx="50" cy="50" r="40"
                  stroke-dasharray="251.2"
                  :stroke-dashoffset="251.2 - (251.2 * (100 - authFailureRate)) / 100"
                />
              </svg>
              <div class="observability-signal-widget__gauge-text">
                <span class="val">{{ summary.metrics.auth_funnel?.total_15m ?? 0 }}</span>
                <span class="label">total reqs</span>
              </div>
            </div>
            <div class="observability-signal-widget__info">
              <h3>Auth events 15m</h3>
              <p class="description">
                Identity & token exchange events, {{ metricsFreshnessLabel(summary.metrics.freshness_seconds) }}
              </p>
              <span class="badge" :class="authFailureRate > 5 ? 'badge--warn' : 'badge--pass'">
                {{ authFailureRate }}% failed
              </span>
            </div>
          </div>

          <!-- Admin Events Widget -->
          <div class="observability-signal-widget">
            <div class="observability-signal-widget__gauge-area">
              <svg class="circular-progress" viewBox="0 0 100 100">
                <circle class="circular-progress__bg" cx="50" cy="50" r="40" />
                <circle
                  class="circular-progress__fill text-emerald-light-fg"
                  cx="50" cy="50" r="40"
                  stroke-dasharray="251.2"
                  :stroke-dashoffset="251.2 - (251.2 * (100 - adminDeniedRate)) / 100"
                />
              </svg>
              <div class="observability-signal-widget__gauge-text">
                <span class="val">{{ summary.metrics.admin_activity?.total_15m ?? 0 }}</span>
                <span class="label">total reqs</span>
              </div>
            </div>
            <div class="observability-signal-widget__info">
              <h3>Admin events 15m</h3>
              <p class="description">
                BFF control plane audit events, {{ metricsFreshnessLabel(summary.metrics.freshness_seconds) }}
              </p>
              <span class="badge text-emerald" :class="adminDeniedRate > 0 ? 'badge--warn' : 'badge--pass'">
                {{ adminDeniedRate }}% denied
              </span>
            </div>
          </div>

          <!-- Queue Pending Widget -->
          <div class="observability-signal-widget">
            <div class="observability-signal-widget__gauge-area">
              <div class="observability-queue-visual">
                <Database class="size-8 text-violet" />
              </div>
            </div>
            <div class="observability-signal-widget__info">
              <h3>Queue pending</h3>
              <div class="queue-values mt-1">
                <div class="queue-val">
                  <strong>{{ summary.metrics.queue?.pending_jobs ?? 0 }}</strong>
                  <span>pending</span>
                </div>
                <div class="queue-divider"></div>
                <div class="queue-val">
                  <strong class="text-rose">{{ summary.metrics.queue?.failed_jobs ?? 0 }}</strong>
                  <span>failed</span>
                </div>
              </div>
              <p class="description mt-2">Background jobs and notifications processor state (live)</p>
              <span class="badge badge--pass">live</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Tab View: Logs -->
      <section v-else-if="activeTab === 'logs'" class="observability-panel-card mt-4" aria-labelledby="logs-title">
        <div class="observability-panel-card__header">
          <div class="observability-panel-card__title-box">
            <Terminal class="size-5 text-indigo-light-fg" />
            <h2 id="logs-title" class="observability-panel-card__title">Recent correlated events</h2>
          </div>
          <span class="observability-panel-card__subtitle">
            Aggregated system events matching correlation indices, {{ recentEventsFreshnessLabel(summary.freshness?.recent_events_seconds) }}
          </span>
        </div>

        <!-- Terminal Console View -->
        <div class="logs-console mt-6">
          <div class="logs-console__header">
            <div class="logs-console__buttons">
              <span class="dot dot--red"></span>
              <span class="dot dot--yellow"></span>
              <span class="dot dot--green"></span>
            </div>
            <div class="logs-console__title">SSO Core Logs Console</div>
            <div class="logs-console__badge">SNAPSHOT</div>
          </div>
          <div class="logs-console__body">
            <div v-for="log in logs" :key="`${log.service}-${log.id ?? log.occurred_at}`" class="logs-console__line">
              <span class="logs-console__time">
                {{ log.occurred_at ? dateFormat.smart(log.occurred_at) : '-' }}
              </span>
              <span class="logs-console__service">{{ log.service }}</span>
              <span class="logs-console__level" :class="`level--${log.severity}`">
                [{{ log.severity.toUpperCase() }}]
              </span>
              <span class="logs-console__msg">{{ log.message }}</span>
              <span class="logs-console__ref" v-if="logReference(log)">
                ref:{{ logReference(log) }}
              </span>
            </div>
            <div v-if="logs.length === 0" class="logs-console__empty">
              <span>No correlated events in the current snapshot window.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Tab View: Traces -->
      <section v-else class="observability-panel-card mt-4" aria-labelledby="traces-title">
        <div class="observability-panel-card__header">
          <div class="observability-panel-card__title-box">
            <GitBranch class="size-5 text-indigo-light-fg" />
            <h2 id="traces-title" class="observability-panel-card__title">Distributed traces</h2>
          </div>
          <span class="observability-panel-card__subtitle">Cross-process OpenTelemetry context propagation spans</span>
        </div>

        <div class="traces-visualization-area mt-6">
          <div class="traces-visualization-card">
            <!-- Title -->
            <div class="traces-visualization-card__badge-row">
              <span class="trace-status-badge trace-status-badge--unavailable">
                {{ traces?.status ?? 'unavailable' }}
              </span>
            </div>

            <!-- SVG Flow Representation -->
            <div class="trace-graph-wrapper my-8">
              <svg class="trace-svg" viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="trace-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.1" />
                    <stop offset="50%" stop-color="var(--primary)" stop-opacity="0.6" />
                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.1" />
                  </linearGradient>
                </defs>

                <!-- Dotted Line paths -->
                <path d="M 190,100 H 330" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 4" class="trace-line-path" />
                <path d="M 470,100 H 610" stroke="var(--border)" stroke-width="2" stroke-dasharray="6 4" class="trace-line-path" />

                <!-- Trace Flow pulse animation line overlay -->
                <path d="M 190,100 H 610" stroke="url(#trace-gradient)" stroke-width="3" class="trace-pulse-overlay" />

                <!-- Node 1 -->
                <g transform="translate(50, 40)">
                  <rect width="140" height="120" rx="16" fill="var(--muted)" stroke="var(--border)" stroke-width="1.5" />
                  <rect width="140" height="120" rx="16" fill="var(--card)" opacity="0.8" />
                  <circle cx="70" cy="40" r="18" fill="color-mix(in oklch, var(--primary) 10%, transparent)" />
                  <path d="M 64,40 H 76 M 70,34 V 46" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" />
                  <text x="70" y="80" text-anchor="middle" fill="var(--foreground)" font-size="13" font-weight="700">SSO Portal</text>
                  <text x="70" y="98" text-anchor="middle" fill="var(--muted-foreground)" font-size="11">Initiator Request</text>
                </g>

                <!-- Node 2 -->
                <g transform="translate(330, 40)">
                  <rect width="140" height="120" rx="16" fill="var(--muted)" stroke="var(--border)" stroke-width="1.5" />
                  <rect width="140" height="120" rx="16" fill="var(--card)" opacity="0.8" />
                  <circle cx="70" cy="40" r="18" fill="color-mix(in oklch, var(--primary) 10%, transparent)" />
                  <path d="M 62,35 H 78 V 45 H 62 Z" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" />
                  <text x="70" y="80" text-anchor="middle" fill="var(--foreground)" font-size="13" font-weight="700">Admin BFF</text>
                  <text x="70" y="98" text-anchor="middle" fill="var(--muted-foreground)" font-size="11">Propagator Node</text>
                </g>

                <!-- Node 3 -->
                <g transform="translate(610, 40)">
                  <rect width="140" height="120" rx="16" fill="var(--muted)" stroke="var(--border)" stroke-width="1.5" />
                  <rect width="140" height="120" rx="16" fill="var(--card)" opacity="0.8" />
                  <circle cx="70" cy="40" r="18" fill="color-mix(in oklch, var(--primary) 10%, transparent)" />
                  <path d="M 64,36 H 76 V 44 H 64 Z M 64,44 H 76 V 46 H 64 Z" stroke="var(--primary)" stroke-width="2" />
                  <text x="70" y="80" text-anchor="middle" fill="var(--foreground)" font-size="13" font-weight="700">SSO Core</text>
                  <text x="70" y="98" text-anchor="middle" fill="var(--muted-foreground)" font-size="11">Backend Target</text>
                </g>
              </svg>
            </div>

            <!-- Trace info box -->
            <div class="trace-info-box">
              <AlertTriangle class="size-5 text-amber" />
              <div class="trace-info-box__content">
                <strong>Why is distributed tracing unavailable?</strong>
                <p class="mt-1 text-sm">{{ traces?.reason }}</p>

                <div class="trace-info-box__action-title mt-3 font-semibold">Recommended integration steps:</div>
                <div class="trace-info-box__action-item mt-1.5">
                  <ArrowRight class="size-4 text-indigo" />
                  <span>{{ traces?.next_step }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Right Side Context Panel -->
    <EvidenceContextPanel title="Observability evidence" :request-id="store.requestId" />
  </section>
</template>

<style scoped>
/* Main Wrapper */
.observability-page-wrapper {
  color: var(--foreground);
  font-family: var(--font-sans);
}

/* Premium Hero Card */
.observability-hero-card {
  position: relative;
  overflow: hidden;
  padding: 2.5rem;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.observability-hero-card__glow {
  position: absolute;
  top: -100px;
  right: -100px;
  width: 350px;
  height: 350px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in oklch, var(--primary) 15%, transparent) 0%, transparent 70%);
  pointer-events: none;
  filter: blur(40px);
}

.observability-hero-card__content {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
}

.observability-hero-card__copy {
  max-width: 720px;
}

.premium-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
  border-radius: 999px;
}

.premium-title {
  margin: 12px 0 8px;
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--foreground);
}

.premium-subtitle {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--muted-foreground);
}

.observability-hero-card__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.premium-action-btn {
  border-radius: 12px;
  font-weight: 600;
  font-size: var(--text-sm);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.shadow-indigo {
  box-shadow: 0 4px 14px 0 color-mix(in srgb, var(--primary) 25%, transparent);
}
.shadow-indigo:hover {
  box-shadow: 0 6px 20px 0 color-mix(in srgb, var(--primary) 35%, transparent);
}

/* Health Top Stats Grid */
.observability-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
}

.observability-stat-card {
  display: flex;
  gap: 1.25rem;
  padding: 1.5rem;
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.observability-stat-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
}

.observability-stat-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 12px;
  flex-shrink: 0;
}

.bg-emerald-light { background: color-mix(in oklch, var(--success) 8%, transparent); }
.text-emerald { color: var(--success); }
.bg-emerald-bar { background: var(--success); }

.bg-blue-light { background: color-mix(in oklch, var(--info) 8%, transparent); }
.text-blue { color: var(--info); }

.bg-indigo-light { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.text-indigo { color: var(--primary); }

.bg-amber-light { background: color-mix(in oklch, var(--warning) 8%, transparent); }
.text-amber { color: var(--warning); }

.observability-stat-card__content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.observability-stat-card__label {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

.observability-stat-card__value-wrapper {
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.observability-stat-card__value {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 850;
  line-height: 1;
}

.observability-stat-card__value-desc {
  font-size: var(--text-xs);
  color: var(--muted-foreground);
}

.observability-stat-card__bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--muted);
  overflow: hidden;
}

.observability-stat-card__bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.5s ease;
}

/* Degraded Banner */
.observability-degraded-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px solid color-mix(in oklch, var(--warning) 20%, transparent);
  background: var(--warning-soft);
  color: var(--warning-soft-fg);
  overflow: hidden;
}

.observability-degraded-banner__indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--warning);
}

.text-amber-banner {
  color: var(--warning);
}

.observability-degraded-banner__text {
  font-size: var(--text-sm);
}

/* Node Cards Grid */
.observability-service-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
}

.observability-node-card {
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  transition: all 0.2s ease;
  position: relative;
}

.observability-node-card:hover {
  transform: translateY(-2px);
}

.observability-node-card--healthy:hover { border-color: color-mix(in oklch, var(--success) 40%, transparent); }
.observability-node-card--degraded:hover { border-color: color-mix(in oklch, var(--warning) 40%, transparent); }
.observability-node-card--down:hover { border-color: color-mix(in oklch, var(--danger) 40%, transparent); }
.observability-node-card--unknown:hover { border-color: color-mix(in srgb, var(--primary) 30%, transparent); }

.observability-node-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.observability-node-card__title-area {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.observability-node-card__icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: var(--muted);
}

.text-indigo-light-fg {
  color: var(--primary);
}

.observability-node-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 800;
}

.observability-node-card__status-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  position: relative;
}

.pulse-dot::after {
  content: '';
  position: absolute;
  top: -3px;
  left: -3px;
  right: -3px;
  bottom: -3px;
  border-radius: 50%;
  animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
  opacity: 0;
}

.pulse-dot--healthy { background: var(--success); }
.pulse-dot--healthy::after { border: 2px solid var(--success); }

.pulse-dot--degraded { background: var(--warning); }
.pulse-dot--degraded::after { border: 2px solid var(--warning); }

.pulse-dot--down { background: var(--danger); }
.pulse-dot--down::after { border: 2px solid var(--danger); }

.pulse-dot--unknown { background: var(--muted-foreground); }

@keyframes pulse-ring {
  0% { transform: scale(0.5); opacity: 0.8; }
  80%, 100% { transform: scale(2.2); opacity: 0; }
}

.observability-node-card__status-text {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.text-status--healthy { color: var(--success); }
.text-status--degraded { color: var(--warning); }
.text-status--down { color: var(--danger); }
.text-status--unknown { color: var(--muted-foreground); }

.observability-node-card__summary {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  line-height: 1.5;
  flex-grow: 1;
}

/* Node Checks */
.observability-node-card__checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.observability-node-card__check-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: var(--text-2xs);
  font-weight: 600;
  border-radius: 6px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.observability-node-card__check-badge--pass {
  color: var(--success-soft-fg);
  background: color-mix(in oklch, var(--success) 6%, transparent);
  border-color: color-mix(in oklch, var(--success) 15%, transparent);
}

.observability-node-card__check-badge--fail {
  color: var(--danger-soft-fg);
  background: color-mix(in oklch, var(--danger) 6%, transparent);
  border-color: color-mix(in oklch, var(--danger) 15%, transparent);
}

.observability-node-card__divider {
  height: 1px;
  background: var(--border);
}

/* Metrics Cluster */
.observability-metrics-cluster {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.observability-metric-item {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 8px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.observability-metric-item__title {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
}

.observability-metric-item__value {
  margin: 4px 0 0;
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.observability-metric-item__value .val {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 850;
  color: var(--foreground);
}

.observability-metric-item__value .unit {
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
}

.observability-node-card__footer {
  margin-top: auto;
}

.observability-node-card__freshness {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
}

/* Premium Tabs Controls */
.premium-tabs {
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
}

.premium-tabs__wrapper {
  display: inline-flex;
  gap: 8px;
  padding: 4px;
  background: var(--muted);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.premium-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--muted-foreground);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.premium-tab-btn:hover {
  color: var(--foreground);
  background: var(--muted);
}

.premium-tab-btn--active {
  color: var(--foreground);
  background: var(--card);
  box-shadow: var(--shadow-card);
}

/* Panel Card */
.observability-panel-card {
  padding: 1.75rem;
  border-radius: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.observability-panel-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1rem;
}

.observability-panel-card__title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.observability-panel-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 800;
}

.observability-panel-card__subtitle {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

/* Signal Metrics Grid */
.observability-signal-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
}

.observability-signal-widget {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem;
  border-radius: 14px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.observability-signal-widget__gauge-area {
  position: relative;
  width: 4.5rem;
  height: 4.5rem;
  flex-shrink: 0;
}

.circular-progress {
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
}

.circular-progress__bg {
  fill: none;
  stroke: var(--border);
  stroke-width: 8;
}

.circular-progress__fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
}

.text-indigo-light-fg { stroke: var(--primary); }
.text-emerald-light-fg { stroke: var(--success); }

.observability-signal-widget__gauge-text {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.observability-signal-widget__gauge-text .val {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 900;
  color: var(--foreground);
}

.observability-signal-widget__gauge-text .label {
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
  transform: scale(0.85);
  margin-top: 2px;
}

.observability-queue-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: color-mix(in oklch, var(--primary) 8%, transparent);
  border: 1.5px solid color-mix(in oklch, var(--primary) 20%, transparent);
}

.text-violet { color: var(--primary); }

.observability-signal-widget__info {
  flex-grow: 1;
}

.observability-signal-widget__info h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 800;
}

.observability-signal-widget__info .description {
  margin: 4px 0 0;
  font-size: var(--text-xs);
  color: var(--muted-foreground);
  line-height: 1.3;
}

.observability-signal-widget__info .badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 6px;
  font-size: var(--text-2xs);
  font-weight: 700;
  border-radius: 4px;
}

.badge--pass {
  color: var(--success-soft-fg);
  background: var(--success-soft);
}

.badge--warn {
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
}

.queue-values {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-val {
  display: flex;
  flex-direction: column;
}

.queue-val strong {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 850;
  line-height: 1;
}

.queue-val span {
  font-size: var(--text-2xs);
  color: var(--muted-foreground);
  margin-top: 2px;
}

.queue-divider {
  width: 1px;
  height: 1.75rem;
  background: var(--border);
}

/* Monospace Terminal Logs Console.
   This is a deliberate skeuomorphic "terminal" surface: it stays dark in BOTH
   themes (like an embedded code/log viewer), so its structural surfaces and
   console-specific neutral text are intentional fixed-dark literals, not
   themeable tokens. Only the status-semantic accents (dots / log levels / live
   badge) are mapped to DS tokens — those saturated tones read correctly on the
   fixed-dark background. */
.logs-console {
  border-radius: 14px;
  background: oklch(0.18 0.012 274);
  border: 1px solid oklch(0.28 0.014 274);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.logs-console__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: oklch(0.22 0.014 274);
  border-bottom: 1px solid oklch(0.28 0.014 274);
}

.logs-console__buttons {
  display: flex;
  gap: 6px;
}

.logs-console__buttons .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot--red { background: var(--danger); }
.dot--yellow { background: var(--warning); }
.dot--green { background: var(--success); }

.logs-console__title {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  /* Console-neutral label on the fixed-dark terminal — intentionally not theme-flipped. */
  color: oklch(0.6 0.02 274);
  font-weight: 700;
  letter-spacing: 0.05em;
}

.logs-console__badge {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--success);
  background: color-mix(in oklch, var(--success) 12%, transparent);
  border: 1px solid color-mix(in oklch, var(--success) 24%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
}

.logs-console__body {
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.6;
  /* Console body text on the fixed-dark terminal — intentional fixed light-grey. */
  color: oklch(0.78 0.02 274);
  max-height: 25rem;
  overflow-y: auto;
}

.logs-console__line {
  display: grid;
  grid-template-columns: 8.5rem 7.5rem 5.5rem 1fr auto;
  gap: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.logs-console__line > * {
  min-width: 0;
}

.logs-console__line:hover {
  /* Light-on-dark row hover for the fixed-dark console — intentional. */
  background: oklch(1 0 0 / 0.03);
}

.logs-console__time {
  color: oklch(0.5 0.02 274);
}

.logs-console__service {
  /* Console accent (service name) on the fixed-dark terminal — intentional. */
  color: oklch(0.74 0.1 256);
  font-weight: 600;
}

.logs-console__level {
  font-weight: 700;
}

.level--info { color: var(--success); }
.level--warning { color: var(--warning); }
.level--error { color: var(--danger); }

.logs-console__msg {
  color: oklch(0.78 0.02 274);
  overflow-wrap: anywhere;
}

.logs-console__ref {
  /* Console accent (correlation ref) on the fixed-dark terminal — intentional. */
  color: oklch(0.78 0.1 14);
  opacity: 0.9;
  font-size: var(--text-2xs);
  overflow-wrap: anywhere;
}

.logs-console__empty {
  padding: 2rem;
  text-align: center;
  color: oklch(0.5 0.02 274);
  font-style: italic;
}

/* Distributed Traces Visualization */
.traces-visualization-area {
  display: flex;
  flex-direction: column;
}

.traces-visualization-card {
  padding: 1.5rem;
  border-radius: 14px;
  background: var(--muted);
  border: 1px solid var(--border);
}

.traces-visualization-card__badge-row {
  display: flex;
  justify-content: flex-start;
}

.trace-status-badge {
  display: inline-flex;
  padding: 4px 10px;
  font-size: var(--text-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 999px;
}

.trace-status-badge--unavailable {
  color: var(--danger-soft-fg);
  background: color-mix(in oklch, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in oklch, var(--danger) 15%, transparent);
}

.trace-graph-wrapper {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  justify-content: center;
}

.trace-svg {
  width: 100%;
  max-width: 760px;
}

.trace-line-path {
  stroke: var(--border);
}

.trace-pulse-overlay {
  stroke-dasharray: 24 360;
  animation: trace-pulse 4s linear infinite;
}

@keyframes trace-pulse {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -384; }
}

.trace-info-box {
  display: flex;
  gap: 0.875rem;
  padding: 1.25rem;
  border-radius: 12px;
  border: 1px solid color-mix(in oklch, var(--warning) 20%, transparent);
  background: color-mix(in oklch, var(--warning) 4%, transparent);
}

.trace-info-box__content {
  flex-grow: 1;
}

.trace-info-box__content strong {
  font-size: var(--text-sm);
  color: var(--foreground);
}

.trace-info-box__content p {
  margin: 0;
  color: var(--muted-foreground);
  line-height: 1.5;
}

.trace-info-box__action-title {
  color: var(--foreground);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.trace-info-box__action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  color: var(--foreground);
  font-weight: 500;
}

/* Responsiveness adjustments */
@media (max-width: 992px) {
  .observability-hero-card__content {
    flex-direction: column;
    align-items: stretch;
    gap: 1.5rem;
  }

  .observability-hero-card__actions {
    justify-content: flex-start;
  }

  .observability-stats-grid,
  .observability-service-cards-grid,
  .observability-signal-metrics-grid {
    grid-template-columns: 1fr;
  }

  .logs-console__line {
    grid-template-columns: 1fr;
    gap: 4px;
    padding: 8px;
  }

  .trace-svg {
    height: auto;
  }
}
</style>
