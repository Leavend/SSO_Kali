<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import type { ObservabilityLogEvent } from '@/types/observability.types'

const props = defineProps<{
  readonly caption: string
  readonly timeLabel: string
  readonly messageLabel: string
  readonly logs: readonly ObservabilityLogEvent[]
}>()

type LogRow = UiDataListRow & {
  readonly time: string
  readonly service: string
  readonly severity: string
  readonly message: string
  readonly reference: string
}

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'time', label: props.timeLabel, align: 'left' },
  { key: 'message', label: props.messageLabel, align: 'left' },
])

const rows = computed<readonly LogRow[]>(() =>
  props.logs.map((log, index) => ({
    id: log.id ?? `log-${index}`,
    time: log.occurred_at ?? '—',
    service: log.service,
    severity: log.severity,
    message: log.message,
    reference: formatTechnicalPreview(log.reference ?? log.id ?? null),
  })),
)
</script>

<template>
  <UiDataList
    class="observability-log-list"
    :caption="caption"
    :columns="columns"
    :rows="rows"
    :total="rows.length"
  >
    <template #cell(time)="{ row }">
      <UiFolio :value="String(row.time)" variant="timestamp" />
      <span class="observability-log-list__service">{{ row.service }}</span>
      <UiStatusBadge :status="String(row.severity)" />
    </template>
    <template #cell(message)="{ row }">
      <span class="observability-log-list__message">{{ row.message }}</span>
      <UiFolio :value="String(row.reference)" variant="id" />
    </template>
  </UiDataList>
</template>

<style scoped>
.observability-log-list__service {
  display: block;
  margin-top: 4px;
  font: 500 0.75rem/1.3 var(--font-sans);
  color: var(--fg-2);
}
.observability-log-list__message {
  display: block;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
</style>
