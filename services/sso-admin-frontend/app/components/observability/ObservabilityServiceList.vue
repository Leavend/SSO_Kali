<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { StatusTone } from '@/lib/status-tone'
import { resolveServiceStatusTone } from '@/lib/observability/observability-view-state'
import type { ObservabilityService } from '@/types/observability.types'

const props = defineProps<{
  readonly caption: string
  readonly nameLabel: string
  readonly statusLabel: string
  readonly services: readonly ObservabilityService[]
}>()

type ServiceRow = UiDataListRow & {
  readonly name: string
  readonly summary: string
  readonly status: string
  readonly tone: StatusTone
  readonly metrics: string
}

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.nameLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

function formatMetrics(service: ObservabilityService): string {
  const parts: string[] = []
  if (service.latency_p95_ms != null) parts.push(`p95 ${service.latency_p95_ms}ms`)
  if (service.freshness_seconds != null) parts.push(`${service.freshness_seconds}s`)
  if (service.queue) parts.push(`q ${service.queue.pending_jobs}/${service.queue.failed_jobs}`)
  return parts.join(' / ')
}

const rows = computed<readonly ServiceRow[]>(() =>
  props.services.map((service) => ({
    id: service.key,
    name: service.name,
    summary: service.summary,
    status: service.status,
    tone: resolveServiceStatusTone(service.status),
    metrics: formatMetrics(service),
  })),
)

function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}
</script>

<template>
  <UiDataList
    class="observability-service-list"
    :caption="caption"
    :columns="columns"
    :rows="rows"
    :total="rows.length"
  >
    <template #cell(name)="{ row }">
      <span class="observability-service-list__name">{{ row.name }}</span>
      <span v-if="row.summary" class="observability-service-list__summary">{{ row.summary }}</span>
    </template>
    <template #cell(status)="{ row }">
      <UiStatusBadge :tone="rowTone(row.tone)" :label="String(row.status)" />
      <UiFolio v-if="row.metrics" :value="String(row.metrics)" variant="count" />
    </template>
  </UiDataList>
</template>

<style scoped>
.observability-service-list__name {
  display: block;
  font: 600 0.8125rem/1.3 var(--font-sans);
  color: var(--fg);
}
.observability-service-list__summary {
  display: block;
  margin-top: 2px;
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
</style>
