<!-- app/components/sso-error-templates/SsoErrorTemplatesTable.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import {
  resolveEnabledTone,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

const props = defineProps<{
  readonly templates: readonly SsoErrorTemplate[]
  readonly caption: string
  readonly codeLabel: string
  readonly localeLabel: string
  readonly titleLabel: string
  readonly statusLabel: string
  readonly enabledText: string
  readonly disabledText: string
}>()

const emit = defineEmits<{ (event: 'select', key: string): void }>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'error_code', label: props.codeLabel, align: 'left' },
  { key: 'locale', label: props.localeLabel, align: 'left' },
  { key: 'title', label: props.titleLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.templates.map((template) => ({
    id: templateKey(template),
    error_code: template.error_code,
    locale: template.locale,
    title: template.title,
    status: template.is_enabled ? props.enabledText : props.disabledText,
  })),
)

function templateByKey(key: string): SsoErrorTemplate | undefined {
  return props.templates.find((template) => templateKey(template) === key)
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(error_code)="{ row }">
      <button
        type="button"
        class="sso-templates-table__select"
        :data-testid="`sso-templates-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ String(row['error_code']) }}
      </button>
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolveEnabledTone(templateByKey(String(row.id))?.is_enabled ?? false)"
        :label="String(row['status'])"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.sso-templates-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.sso-templates-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
