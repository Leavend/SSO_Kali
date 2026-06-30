<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { StatusTone } from '@/lib/status-tone'

export type UsersTableRow = {
  readonly id: string
  readonly displayName: string
  readonly email: string
  readonly role: string
  readonly status: string
  readonly statusTone: StatusTone
}

const props = withDefaults(
  defineProps<{
    readonly caption: string
    readonly userLabel: string
    readonly emailLabel: string
    readonly roleLabel: string
    readonly statusLabel: string
    readonly viewLabel: string
    readonly rows: readonly UsersTableRow[]
    readonly total: number
    readonly page?: number
    readonly pageCount?: number
    readonly nextLabel?: string
    readonly previousLabel?: string
  }>(),
  {
    page: undefined,
    pageCount: undefined,
    nextLabel: undefined,
    previousLabel: undefined,
  },
)

const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'next'): void
  (event: 'previous'): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'displayName', label: props.userLabel, align: 'left' },
  { key: 'email', label: props.emailLabel, align: 'left' },
  { key: 'role', label: props.roleLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

// UsersTableRow is structurally assignable to UiDataListRow (every field is a
// string and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

// row.* arrives typed as string | number | null | undefined (UiDataListRow); the
// page only ever feeds well-formed UsersTableRows, so narrow defensively.
function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}

function rowText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="users-table" data-component="users-table">
    <UiDataList
      :caption="caption"
      :columns="columns"
      :rows="dataRows"
      :total="total"
      :next-label="nextLabel"
      :previous-label="previousLabel"
      @next="emit('next')"
      @previous="emit('previous')"
    >
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
      </template>
      <template #actions="{ row }">
        <UiButton
          variant="ghost"
          size="sm"
          data-testid="users-row-view"
          @click="emit('select', String(row.id))"
        >
          {{ viewLabel }}
        </UiButton>
      </template>
    </UiDataList>

    <div v-if="showFolio" class="users-table__pagefolio">
      <span data-testid="users-page-folio">
        <UiFolio :index="page" :total="pageCount" variant="count" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.users-table {
  display: grid;
  gap: 12px;
}
.users-table__pagefolio {
  display: flex;
  justify-content: flex-end;
  color: var(--fg-3);
}
</style>
