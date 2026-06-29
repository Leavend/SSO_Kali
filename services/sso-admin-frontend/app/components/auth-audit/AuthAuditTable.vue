<!-- app/components/auth-audit/AuthAuditTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveOutcomeTone } from '@/lib/auth-audit/auth-audit-view-state'
import type { AuthAuditEvent } from '@/types/auth-audit.types'

const props = defineProps<{
  readonly events: readonly AuthAuditEvent[]
  readonly caption: string
  readonly occurredLabel: string
  readonly typeLabel: string
  readonly outcomeLabel: string
  readonly subjectLabel: string
  readonly ipLabel: string
  readonly outcomeText: (outcome: string) => string
}>()

const emit = defineEmits<{ (event: 'select', eventId: string): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'occurred', label: props.occurredLabel, align: 'left', variant: 'timestamp' },
  { key: 'type', label: props.typeLabel, align: 'left' },
  { key: 'outcome', label: props.outcomeLabel, align: 'left' },
  { key: 'subject', label: props.subjectLabel, align: 'left' },
  { key: 'ip', label: props.ipLabel, align: 'left' },
])

// The subject cell prefers email (the allowed display field); subject_id is an
// opaque ULID fallback. No raw gov-PII is present in the DTO.
const rows = computed<readonly UiDataListRow[]>(() =>
  props.events.map((e) => ({
    id: e.event_id,
    occurred: e.occurred_at ?? '—',
    type: e.event_type,
    outcome: e.outcome,
    subject: e.subject.email ?? e.subject.subject_id ?? '—',
    ip: e.request.ip_address ?? '—',
  })),
)
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(occurred)="{ row }">
      <button
        type="button"
        class="auth-audit-table__select"
        :data-testid="`auth-audit-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        <UiFolio :value="String(row['occurred'])" variant="timestamp" />
      </button>
    </template>

    <template #cell(outcome)="{ row }">
      <UiStatusBadge
        :data-testid="`auth-audit-outcome-${row.id}`"
        :tone="resolveOutcomeTone(String(row['outcome']))"
        :label="outcomeText(String(row['outcome']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.auth-audit-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.auth-audit-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
