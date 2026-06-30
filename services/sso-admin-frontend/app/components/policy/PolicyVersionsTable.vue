<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolvePolicyStatusTone } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy } from '@/types/policy.types'

const props = defineProps<{
  readonly policies: readonly SecurityPolicy[]
  readonly caption: string
  readonly versionLabel: string
  readonly effectiveLabel: string
  readonly statusLabel: string
  readonly actorLabel: string
  readonly statusLabels: Readonly<Record<string, string>>
}>()

const emit = defineEmits<{
  (event: 'select', id: number): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'version', label: props.versionLabel, align: 'left' },
  { key: 'effective', label: props.effectiveLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.policies.map((policy) => ({
    id: String(policy.id),
    version: policy.version,
    effective: policy.effective_at ?? '—',
    status: policy.status,
    actor: policy.actor_subject_id ?? '—',
  })),
)

function statusText(status: string): string {
  return props.statusLabels[status] ?? status
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(version)="{ row }">
      <button
        type="button"
        class="policy-versions__select"
        :data-testid="`policy-version-select-${row.id}`"
        @click="emit('select', Number(row.id))"
      >
        <UiFolio :index="Number(row['version'])" variant="count" />
      </button>
      <span class="policy-versions__actor">
        {{ actorLabel }}:
        <UiFolio :value="String(row['actor'])" variant="id" />
      </span>
    </template>

    <template #cell(effective)="{ row }">
      <UiFolio :value="String(row['effective'])" variant="timestamp" />
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolvePolicyStatusTone(String(row['status']))"
        :label="statusText(String(row['status']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.policy-versions__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
}
.policy-versions__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.policy-versions__actor {
  display: block;
  margin-top: 2px;
  font: 400 0.6875rem/1.2 var(--font-sans);
  color: var(--fg-3);
}
</style>
