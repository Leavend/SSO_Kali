<script setup lang="ts">
import UiFolio from './UiFolio.vue'

export type UiDataListColumn = {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'right'
  readonly variant?: 'text' | 'id' | 'timestamp'
}

export type UiDataListRow = Readonly<Record<string, string | number | null | undefined>> & {
  readonly id: string
}

interface Props {
  readonly caption: string
  readonly columns: readonly UiDataListColumn[]
  readonly rows: readonly UiDataListRow[]
  readonly total?: number
  readonly folioIndex?: boolean
  readonly density?: 'compact' | 'comfortable'
  readonly nextLabel?: string
  readonly previousLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  total: undefined,
  folioIndex: false,
  density: 'compact',
  nextLabel: undefined,
  previousLabel: undefined,
})

const emit = defineEmits<{ (event: 'next'): void; (event: 'previous'): void }>()

function cellText(row: UiDataListRow, key: string): string {
  const value = row[key]
  return value == null || value === '' ? '—' : String(value)
}
</script>

<template>
  <section class="ui-tbl-shell" :class="`ui-tbl-shell--${density}`">
    <div class="ui-tbl-scroll">
      <table class="ui-tbl">
        <caption class="ui-tbl__caption">
          <span class="ui-tbl__caption-text">{{ caption }}</span>
          <UiFolio
            class="ui-tbl__folio"
            :index="rows.length"
            :total="total ?? rows.length"
            variant="count"
          />
        </caption>
        <thead>
          <tr>
            <th v-if="folioIndex" scope="col" class="ui-tbl__folio-head">#</th>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="column.align === 'right' ? 'ui-tbl__cell--right' : undefined"
            >
              {{ column.label }}
            </th>
            <th v-if="$slots.actions" scope="col" class="ui-tbl__cell--right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in rows" :key="row.id">
            <td v-if="folioIndex" class="ui-tbl__folio-cell">
              <UiFolio :index="rowIndex + 1" :pad="String(rows.length).length" />
            </td>
            <td
              v-for="column in columns"
              :key="column.key"
              :class="column.align === 'right' ? 'ui-tbl__cell--right' : undefined"
            >
              <slot :name="`cell(${column.key})`" :row="row">
                <UiFolio
                  v-if="column.variant === 'id' || column.variant === 'timestamp'"
                  :value="cellText(row, column.key)"
                  :variant="column.variant"
                />
                <template v-else>{{ cellText(row, column.key) }}</template>
              </slot>
            </td>
            <td v-if="$slots.actions" class="ui-tbl__cell--right">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="previousLabel || nextLabel"
      class="ui-tbl__pagination"
      aria-label="Cursor pagination"
    >
      <button
        v-if="previousLabel"
        type="button"
        class="ui-tbl__page-btn"
        data-testid="data-list-previous"
        @click="emit('previous')"
      >
        {{ previousLabel }}
      </button>
      <button
        v-if="nextLabel"
        type="button"
        class="ui-tbl__page-btn"
        data-testid="data-list-next"
        @click="emit('next')"
      >
        {{ nextLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ui-tbl-shell {
  display: grid;
  gap: 12px;
}
.ui-tbl-scroll {
  overflow-x: auto;
  border: 1px solid var(--border);
  background: var(--card);
}
.ui-tbl {
  width: 100%;
  border-collapse: collapse;
  font: 400 0.8125rem/1.4 var(--font-sans);
}
.ui-tbl__caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}
.ui-tbl__caption-text {
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--fg);
}
/* Visible 1px modular grid: hairlines on every cell, vertical + horizontal. */
.ui-tbl th,
.ui-tbl td {
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  border: 1px solid var(--border);
}
.ui-tbl thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
  background: var(--bg-2);
  white-space: nowrap;
}
.ui-tbl tbody td {
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.ui-tbl-shell--compact th,
.ui-tbl-shell--compact td {
  padding-block: 7px;
}
.ui-tbl__folio-head,
.ui-tbl__folio-cell {
  width: 1%;
  white-space: nowrap;
  text-align: right;
  color: var(--fg-3);
}
.ui-tbl__cell--right {
  text-align: right;
}
.ui-tbl__pagination {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ui-tbl__page-btn {
  min-height: 30px;
  padding: 0 12px;
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.ui-tbl__page-btn:hover {
  background: var(--muted);
}
.ui-tbl__page-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
