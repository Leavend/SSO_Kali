<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { StatusTone } from '@/lib/status-tone'

export type DashboardMetricRow = {
  readonly id: string
  readonly label: string
  readonly value: number | null
  readonly tone: StatusTone
}

const props = defineProps<{
  readonly caption: string
  readonly metricLabel: string
  readonly countLabel: string
  readonly rows: readonly DashboardMetricRow[]
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'label', label: props.metricLabel, align: 'left' },
  { key: 'value', label: props.countLabel, align: 'right' },
])

// DashboardMetricRow is structurally assignable to UiDataListRow (all fields are
// string | number | null and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

function formatValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(numeric) ? String(value) : new Intl.NumberFormat().format(numeric)
}

function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}
</script>

<template>
  <UiDataList
    class="dashboard-metric-group"
    :caption="caption"
    :columns="columns"
    :rows="dataRows"
    :total="rows.length"
  >
    <template #cell(value)="{ row }">
      <UiStatusBadge
        v-if="rowTone(row.tone) !== 'neutral'"
        :tone="rowTone(row.tone)"
        :label="formatValue(row.value)"
      />
      <UiFolio v-else :value="formatValue(row.value)" variant="count" />
    </template>
  </UiDataList>
</template>

<style scoped>
.dashboard-metric-group {
  break-inside: avoid;
}
</style>
