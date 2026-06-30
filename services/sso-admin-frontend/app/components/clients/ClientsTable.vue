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

export type ClientsTableRow = {
  readonly id: string
  readonly name: string
  readonly clientId: string
  readonly category: string
  readonly status: string
  readonly statusTone: StatusTone
}

const props = withDefaults(
  defineProps<{
    readonly caption: string
    readonly nameLabel: string
    readonly clientIdLabel: string
    readonly categoryLabel: string
    readonly statusLabel: string
    readonly viewLabel: string
    readonly rows: readonly ClientsTableRow[]
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
  { key: 'name', label: props.nameLabel, align: 'left' },
  // client_id is a public identifier rendered as a mono/folio composition element
  { key: 'clientId', label: props.clientIdLabel, align: 'left', variant: 'id' },
  { key: 'category', label: props.categoryLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

// ClientsTableRow is structurally assignable to UiDataListRow (every field is a
// string and it carries an `id`), so this is identity at runtime.
const dataRows = computed<readonly UiDataListRow[]>(() => props.rows)

const showFolio = computed<boolean>(() => props.page != null && props.pageCount != null)

// row.* arrives typed as string | number | null | undefined (UiDataListRow); the
// page only ever feeds well-formed ClientsTableRows, so narrow defensively.
function rowTone(value: unknown): StatusTone {
  return (typeof value === 'string' ? value : 'neutral') as StatusTone
}

// Category badge tone: staff apps are brand-toned, everything else neutral. Tone
// is derived (the row type carries no categoryTone) but never stands alone — the
// badge always pairs the dot with the category label.
function categoryTone(value: unknown): StatusTone {
  return String(value ?? '').toLowerCase() === 'kepegawaian' ? 'brand' : 'neutral'
}

function rowText(value: unknown): string {
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="clients-table" data-component="clients-table">
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
      <template #cell(category)="{ row }">
        <UiStatusBadge :tone="categoryTone(row.category)" :label="rowText(row.category)" />
      </template>
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="rowTone(row.statusTone)" :label="rowText(row.status)" />
      </template>
      <template #actions="{ row }">
        <UiButton
          variant="ghost"
          size="sm"
          data-testid="clients-row-view"
          @click="emit('select', String(row.id))"
        >
          {{ viewLabel }}
        </UiButton>
      </template>
    </UiDataList>

    <div v-if="showFolio" class="clients-table__pagefolio">
      <span data-testid="clients-page-folio">
        <UiFolio :index="page" :total="pageCount" variant="count" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.clients-table {
  display: grid;
  gap: 12px;
}
.clients-table__pagefolio {
  display: flex;
  justify-content: flex-end;
  color: var(--fg-3);
}
</style>
