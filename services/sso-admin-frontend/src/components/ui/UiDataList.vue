<script setup lang="ts">
export type UiDataListColumn = {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'right'
}

export type UiDataListRow = Readonly<Record<string, string | number | null | undefined>> & {
  readonly id: string
}

interface Props {
  readonly caption: string
  readonly columns: readonly UiDataListColumn[]
  readonly rows: readonly UiDataListRow[]
  readonly density?: 'compact' | 'comfortable'
  readonly nextLabel?: string
  readonly previousLabel?: string
}

withDefaults(defineProps<Props>(), {
  density: 'compact',
  nextLabel: undefined,
  previousLabel: undefined,
})

const emit = defineEmits<{ (event: 'next'): void; (event: 'previous'): void }>()
</script>

<template>
  <section class="ui-data-list" :class="`ui-data-list--${density}`">
    <div class="ui-data-list__viewport">
      <table>
        <caption>
          {{
            caption
          }}
        </caption>
        <thead class="sticky">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="column.align === 'right' ? 'ui-data-list__cell--right' : undefined"
            >
              {{ column.label }}
            </th>
            <th v-if="$slots.actions" scope="col" class="ui-data-list__cell--right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td
              v-for="column in columns"
              :key="column.key"
              :class="column.align === 'right' ? 'ui-data-list__cell--right' : undefined"
            >
              {{ row[column.key] ?? '—' }}
            </td>
            <td v-if="$slots.actions" class="ui-data-list__cell--right">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="previousLabel || nextLabel"
      class="ui-data-list__pagination"
      aria-label="Cursor pagination"
    >
      <button
        v-if="previousLabel"
        class="ui-action ui-action--secondary"
        type="button"
        @click="emit('previous')"
      >
        {{ previousLabel }}
      </button>
      <button
        v-if="nextLabel"
        class="ui-action ui-action--secondary"
        type="button"
        @click="emit('next')"
      >
        {{ nextLabel }}
      </button>
    </div>
  </section>
</template>
