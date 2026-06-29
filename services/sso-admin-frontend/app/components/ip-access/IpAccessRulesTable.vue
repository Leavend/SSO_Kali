<!-- app/components/ip-access/IpAccessRulesTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveModeTone } from '@/lib/ip-access/ip-access-view-state'
import type { IpAccessRule } from '@/types/ip-access.types'

const props = defineProps<{
  readonly rules: readonly IpAccessRule[]
  readonly caption: string
  readonly cidrLabel: string
  readonly modeLabel: string
  readonly reasonLabel: string
  readonly createdLabel: string
  readonly allowText: string
  readonly blockText: string
}>()

const emit = defineEmits<{ (event: 'select', id: number): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'cidr', label: props.cidrLabel, align: 'left' },
  { key: 'mode', label: props.modeLabel, align: 'left' },
  { key: 'reason', label: props.reasonLabel, align: 'left' },
  { key: 'created', label: props.createdLabel, align: 'right', variant: 'timestamp' },
])

// UiDataListRow.id is a string; the rule's numeric id is stringified for the row
// and parsed back to a number on select.
const rows = computed<readonly UiDataListRow[]>(() =>
  props.rules.map((rule) => ({
    id: String(rule.id),
    cidr: rule.cidr,
    mode: rule.mode,
    reason: rule.reason ?? '—',
    created: rule.created_at ?? '—',
  })),
)

function ruleById(id: number): IpAccessRule | undefined {
  return props.rules.find((rule) => rule.id === id)
}

function modeText(mode: string): string {
  return mode === 'allow' ? props.allowText : props.blockText
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(cidr)="{ row }">
      <button
        type="button"
        class="ip-access-table__select"
        :data-testid="`ip-access-select-${row.id}`"
        @click="emit('select', Number(row.id))"
      >
        <UiFolio :value="String(row['cidr'])" variant="id" />
      </button>
    </template>

    <template #cell(mode)="{ row }">
      <UiStatusBadge
        :tone="resolveModeTone(ruleById(Number(row.id))?.mode ?? 'block')"
        :label="modeText(String(row['mode']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.ip-access-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.ip-access-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
