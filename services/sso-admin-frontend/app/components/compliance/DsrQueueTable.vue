<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { resolveDsrStatusTone } from '@/lib/compliance/compliance-view-state'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import { useI18n } from '@/composables/useI18n'
import type { DataSubjectRequest, DsrStatus } from '@/types/compliance.types'

const props = defineProps<{
  readonly caption: string
  readonly rows: readonly DataSubjectRequest[]
  readonly canReview: boolean
}>()

const emit = defineEmits<{
  (event: 'review', request: DataSubjectRequest): void
  (event: 'fulfill', request: DataSubjectRequest): void
}>()

const { t } = useI18n()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'requestRef', label: t('observability.dsr_request'), align: 'left', variant: 'id' },
  { key: 'subjectRef', label: t('observability.dsr_subject'), align: 'left', variant: 'id' },
  { key: 'type', label: t('observability.dsr_type'), align: 'left' },
  { key: 'status', label: t('observability.dsr_status'), align: 'left' },
  { key: 'sla', label: t('observability.dsr_sla'), align: 'left', variant: 'timestamp' },
])

// PII minimization: only masked opaque ids + type/status/sla reach the row.
// reason / reviewer_subject_id / reviewer_notes are deliberately NOT projected.
const dataRows = computed<readonly UiDataListRow[]>(() =>
  props.rows.map((request) => ({
    id: request.request_id,
    requestRef: formatTechnicalPreview(request.request_id),
    subjectRef: formatTechnicalPreview(request.subject_id),
    type: request.type,
    status: request.status,
    sla: request.sla_due_at ?? '—',
  })),
)

const byId = computed(() => new Map(props.rows.map((request) => [request.request_id, request])))
function rowRequest(id: string): DataSubjectRequest | undefined {
  return byId.value.get(id)
}
function statusTone(id: string) {
  const status: DsrStatus = rowRequest(id)?.status ?? 'submitted'
  return resolveDsrStatusTone(status)
}
function canApprove(id: string): boolean {
  return rowRequest(id)?.status === 'submitted'
}
function canFulfill(id: string): boolean {
  return rowRequest(id)?.status === 'approved'
}
function onReview(id: string): void {
  const request = rowRequest(id)
  if (request) emit('review', request)
}
function onFulfill(id: string): void {
  const request = rowRequest(id)
  if (request) emit('fulfill', request)
}
</script>

<template>
  <UiDataList
    :caption="caption"
    :columns="columns"
    :rows="dataRows"
    :total="rows.length"
    data-component="dsr-queue-table"
  >
    <template #cell(type)="{ row }">
      <UiStatusBadge tone="neutral" :label="String(row.type)" />
    </template>
    <template #cell(status)="{ row }">
      <UiStatusBadge :tone="statusTone(String(row.id))" :label="String(row.status)" />
    </template>
    <template v-if="canReview" #actions="{ row }">
      <UiButton
        size="sm"
        variant="secondary"
        :data-action="`review-${row.id}`"
        :disabled="!canApprove(String(row.id))"
        @click="onReview(String(row.id))"
      >
        {{ t('observability.dsr_btn_review') }}
      </UiButton>
      <UiButton
        size="sm"
        variant="secondary"
        :data-action="`fulfill-${row.id}`"
        :disabled="!canFulfill(String(row.id))"
        @click="onFulfill(String(row.id))"
      >
        {{ t('observability.dsr_btn_fulfill') }}
      </UiButton>
    </template>
  </UiDataList>
</template>

<style scoped>
.dsr-queue-table {
  display: grid;
  gap: 12px;
}
</style>
