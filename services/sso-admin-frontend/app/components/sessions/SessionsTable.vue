<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { AdminSession } from '@/types/sessions.types'

const props = defineProps<{
  readonly sessions: readonly AdminSession[]
  readonly caption: string
  readonly userLabel: string
  readonly sessionIdLabel: string
  readonly clientLabel: string
  readonly ipLabel: string
  readonly statusLabel: string
  readonly activeLabel: string
}>()

const emit = defineEmits<{
  (event: 'select', sessionId: string): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'user', label: props.userLabel, align: 'left' },
  { key: 'session', label: props.sessionIdLabel, align: 'left' },
  { key: 'client', label: props.clientLabel, align: 'left' },
  { key: 'ip', label: props.ipLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.sessions.map((session) => ({
    id: session.session_id,
    user: session.display_name ?? '—',
    session: session.session_id,
    client: session.client_id ?? '—',
    ip: session.ip_address ?? '—',
  })),
)
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(user)="{ row }">
      <button
        type="button"
        class="sessions-table__select"
        :data-testid="`session-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ row['user'] }}
      </button>
    </template>

    <template #cell(session)="{ row }">
      <UiFolio :value="String(row['session'])" variant="id" />
    </template>

    <template #cell(ip)="{ row }">
      <UiFolio :value="String(row['ip'])" variant="id" />
    </template>

    <template #cell(status)>
      <UiStatusBadge tone="success" :label="activeLabel" />
    </template>
  </UiDataList>
</template>

<style scoped>
.sessions-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.sessions-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
