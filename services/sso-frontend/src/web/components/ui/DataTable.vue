<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-vue-next'

export interface TableColumn<T = Record<string, unknown>> {
  key: keyof T | string
  label: string
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
}

export interface TableSort {
  key: string
  direction: 'asc' | 'desc'
}

const props = withDefaults(defineProps<{
  columns: TableColumn[]
  data: Record<string, unknown>[]
  loading?: boolean
  selectable?: boolean
  rowKey?: string
}>(), {
  loading: false,
  selectable: false,
  rowKey: 'id',
})

const emit = defineEmits<{
  'sort': [sort: TableSort]
  'select': [selected: string[]]
}>()

const sort = ref<TableSort>({ key: '', direction: 'asc' })
const selectedRows = ref<Set<string>>(new Set())

const sortedData = computed(() => {
  if (!sort.value.key) return props.data

  return [...props.data].sort((a, b) => {
    const aVal = String(a[sort.value.key] ?? '')
    const bVal = String(b[sort.value.key] ?? '')

    if (aVal === bVal) return 0

    const comparison = aVal < bVal ? -1 : 1
    return sort.value.direction === 'asc' ? comparison : -comparison
  })
})

function handleSort(key: string) {
  if (sort.value.key === key) {
    sort.value.direction = sort.value.direction === 'asc' ? 'desc' : 'asc'
  } else {
    sort.value = { key, direction: 'asc' }
  }
  emit('sort', sort.value)
}

function getSortIcon(key: string) {
  if (sort.value.key !== key) return ChevronsUpDown
  return sort.value.direction === 'asc' ? ChevronUp : ChevronDown
}

function isSelected(key: string): boolean {
  return selectedRows.value.has(key)
}

function toggleSelect(key: string) {
  if (selectedRows.value.has(key)) {
    selectedRows.value.delete(key)
  } else {
    selectedRows.value.add(key)
  }
  emit('select', Array.from(selectedRows.value))
}

function toggleSelectAll() {
  if (selectedRows.value.size === props.data.length) {
    selectedRows.value.clear()
  } else {
    props.data.forEach(row => {
      selectedRows.value.add(String(row[props.rowKey]))
    })
  }
  emit('select', Array.from(selectedRows.value))
}

function getRowKey(row: Record<string, unknown>): string {
  return String(row[props.rowKey])
}

watch(() => props.data, (rows) => {
  const validKeys = new Set(rows.map(getRowKey))
  selectedRows.value = new Set([...selectedRows.value].filter(key => validKeys.has(key)))
  emit('select', Array.from(selectedRows.value))
})
</script>

<template>
  <div class="data-table-wrapper">
    <!-- Table -->
    <div class="data-table-scroll">
      <table class="data-table" role="grid">
        <thead class="data-table__head">
          <tr>
            <th v-if="selectable" class="data-table__th--checkbox">
              <input
                type="checkbox"
                class="data-table__checkbox"
                :checked="selectedRows.size === data.length && data.length > 0"
                :indeterminate="selectedRows.size > 0 && selectedRows.size < data.length"
                aria-label="Select all rows"
                @change="toggleSelectAll"
              />
            </th>
            <th
              v-for="column in columns"
              :key="String(column.key)"
              class="data-table__th"
              :style="{ width: column.width }"
              :class="{ 'data-table__th--sortable': column.sortable }"
            >
              <button
                v-if="column.sortable"
                type="button"
                class="data-table__sort-btn"
                :aria-label="`Sort by ${column.label}`"
                @click="handleSort(String(column.key))"
              >
                {{ column.label }}
                <component
                  :is="getSortIcon(String(column.key))"
                  :size="14"
                  class="data-table__sort-icon"
                  :class="{ 'data-table__sort-icon--active': sort.key === column.key }"
                />
              </button>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="data-table__body">
          <!-- Loading skeleton -->
          <template v-if="loading">
            <tr v-for="n in 5" :key="`skeleton-${n}`" class="data-table__row">
              <td v-if="selectable" class="data-table__td--checkbox">
                <span class="skeleton skeleton--checkbox" />
              </td>
              <td v-for="column in columns" :key="String(column.key)" class="data-table__td">
                <span class="skeleton skeleton--text" />
              </td>
            </tr>
          </template>

          <!-- Empty state -->
          <tr v-else-if="data.length === 0">
            <td :colspan="selectable ? columns.length + 1 : columns.length" class="data-table__empty">
              <slot name="empty">
                <p>Tidak ada data</p>
              </slot>
            </td>
          </tr>

          <!-- Data rows -->
          <tr
            v-else
            v-for="row in sortedData"
            :key="getRowKey(row)"
            class="data-table__row"
            :class="{ 'data-table__row--selected': isSelected(getRowKey(row)) }"
          >
            <td v-if="selectable" class="data-table__td--checkbox">
              <input
                type="checkbox"
                class="data-table__checkbox"
                :checked="isSelected(getRowKey(row))"
                :aria-label="`Select row ${getRowKey(row)}`"
                @change="toggleSelect(getRowKey(row))"
              />
            </td>
            <td
              v-for="column in columns"
              :key="String(column.key)"
              class="data-table__td"
              :data-label="column.label"
              :style="{ textAlign: column.align }"
            >
              <slot :name="`cell-${String(column.key)}`" :row="row">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.data-table-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.data-table-scroll {
  overflow-x: auto;
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  background: var(--admin-panel);
}

.data-table {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
}

.data-table__head {
  background: var(--admin-panel-muted);
  border-bottom: 1px solid var(--admin-line);
}

.data-table__th,
.data-table__td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  vertical-align: middle;
}

.data-table__th {
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
  color: var(--admin-subtle);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.data-table__th--checkbox {
  width: 48px;
  padding-right: 0;
}

.data-table__td--checkbox {
  width: 48px;
  padding-right: 0;
}

.data-table__sort-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  font-size: inherit;
  font-weight: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
  transition: background-color var(--duration-fast) ease;
}

.data-table__sort-btn:hover {
  background: var(--admin-panel);
}

.data-table__sort-icon {
  color: var(--admin-subtle);
  transition: color var(--duration-fast) ease;
}

.data-table__sort-icon--active {
  color: var(--admin-accent);
}

.data-table__row {
  border-bottom: 1px solid var(--admin-line);
  transition: background-color var(--duration-fast) ease;
}

.data-table__row:last-child {
  border-bottom: none;
}

.data-table__row:hover {
  background: var(--admin-panel-muted);
}

.data-table__row--selected {
  background: color-mix(in srgb, var(--admin-accent-soft) 40%, transparent);
}

.data-table__row--selected:hover {
  background: color-mix(in srgb, var(--admin-accent-soft) 60%, transparent);
}

.data-table__checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--admin-accent);
}

.data-table__empty {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--admin-muted);
}

/* Skeleton */
.skeleton--checkbox {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  background: var(--admin-panel-muted);
}

/* Mobile: Card view */
@media (max-width: 768px) {
  .data-table-scroll {
    border: none;
    background: transparent;
  }

  .data-table {
    min-width: 0;
  }

  .data-table__head {
    display: none;
  }

  .data-table__row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--admin-line);
    border-radius: var(--radius-lg);
    background: var(--admin-panel);
  }

  .data-table__row:last-child {
    margin-bottom: 0;
  }

  .data-table__td {
    display: flex;
    justify-content: space-between;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--admin-line);
  }

  .data-table__td:last-child {
    border-bottom: none;
  }

  .data-table__td::before {
    content: attr(data-label);
    color: var(--admin-subtle);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .data-table__td--checkbox {
    display: none;
  }
}
</style>
