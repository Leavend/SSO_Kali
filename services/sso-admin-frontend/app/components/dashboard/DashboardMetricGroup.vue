<script setup lang="ts">
import {
  Users,
  UserX,
  History,
  Activity,
  Laptop,
  ShieldAlert,
  ClipboardList,
  HelpCircle
} from 'lucide-vue-next'
import type { StatusTone } from '@/lib/status-tone'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'

export type DashboardMetricRow = {
  readonly id: string
  readonly label: string
  readonly value: number | null
  readonly tone: StatusTone
}

defineProps<{
  readonly caption: string
  readonly metricLabel: string
  readonly countLabel: string
  readonly rows: readonly DashboardMetricRow[]
}>()

const METRIC_ICONS: Record<string, any> = {
  'users.total': Users,
  'users.locked': UserX,
  'sessions.portal_active': History,
  'sessions.active': Activity,
  'clients.total': Laptop,
  'audit.admin_last_24h': ShieldAlert,
  'audit.total': ClipboardList,
}

function getMetricIcon(rowId: string) {
  return METRIC_ICONS[rowId] || HelpCircle
}

function formatValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(numeric) ? String(value) : new Intl.NumberFormat().format(numeric)
}

function rowTone(tone: string): StatusTone {
  return tone as StatusTone
}
</script>

<template>
  <div class="metric-group">
    <h3 class="metric-group__title">{{ caption }}</h3>
    <div class="metric-group__grid">
      <div
        v-for="row in rows"
        :key="row.id"
        class="metric-card"
        :data-tone="row.tone"
      >
        <div class="metric-card__header">
          <div class="metric-card__icon-container">
            <component :is="getMetricIcon(row.id)" :size="20" class="metric-card__icon" />
          </div>
          <!-- Custom status badge indicators from the design system -->
          <UiStatusBadge
            v-if="rowTone(row.tone) !== 'neutral'"
            :tone="rowTone(row.tone)"
            :label="formatValue(row.value)"
          />
        </div>
        <div class="metric-card__body">
          <!-- Big bold value -->
          <p class="metric-card__value">
            <UiFolio
              v-if="rowTone(row.tone) === 'neutral'"
              :value="formatValue(row.value)"
              variant="count"
            />
            <template v-else>
              {{ formatValue(row.value) }}
            </template>
          </p>
          <h4 class="metric-card__label">{{ row.label }}</h4>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metric-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  break-inside: avoid;
}

.metric-group__title {
  font: 700 0.875rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  margin: 0;
}

.metric-group__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.metric-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md), var(--shadow-glow);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
}

.metric-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-card__icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  background: var(--bg-2);
  color: var(--fg-2);
  transition: all 0.25s ease;
}

.metric-card:hover .metric-card__icon-container {
  background: var(--accent-soft);
  color: var(--accent);
}

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-card__value {
  margin: 0;
  font: 800 1.75rem/1 var(--font-sans);
  letter-spacing: -0.03em;
  color: var(--fg);
}

.metric-card__value :deep(.ui-folio) {
  font: 800 1.75rem/1 var(--font-sans);
  color: var(--fg);
  font-family: var(--font-sans);
  letter-spacing: -0.03em;
}

.metric-card__label {
  margin: 0;
  font: 500 0.775rem/1.3 var(--font-sans);
  color: var(--fg-2);
  text-transform: capitalize;
}
</style>
