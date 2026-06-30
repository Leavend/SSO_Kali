<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveEnabledTone, resolveHealthTone } from '@/lib/external-idps/external-idps-view-state'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

const props = defineProps<{
  readonly providers: readonly ExternalIdentityProvider[]
  readonly caption: string
  readonly providerLabel: string
  readonly keyLabel: string
  readonly statusLabel: string
  readonly healthLabel: string
  readonly enabledText: string
  readonly disabledText: string
  readonly healthLabels: Readonly<Record<string, string>>
}>()

const emit = defineEmits<{
  (event: 'select', providerKey: string): void
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'provider', label: props.providerLabel, align: 'left' },
  { key: 'pkey', label: props.keyLabel, align: 'left' },
  { key: 'status', label: props.statusLabel, align: 'left' },
  { key: 'health', label: props.healthLabel, align: 'right' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.providers.map((provider) => ({
    id: provider.provider_key,
    provider: provider.display_name,
    pkey: provider.provider_key,
    enabled: provider.enabled ? 'on' : 'off',
    health: provider.health_status ?? 'unknown',
  })),
)

function providerByKey(key: string): ExternalIdentityProvider | undefined {
  return props.providers.find((provider) => provider.provider_key === key)
}

function healthText(status: string): string {
  return props.healthLabels[status] ?? status
}
</script>

<template>
  <UiDataList :caption="caption" :columns="columns" :rows="rows">
    <template #cell(provider)="{ row }">
      <button
        type="button"
        class="external-idps-table__select"
        :data-testid="`external-idp-select-${row.id}`"
        @click="emit('select', String(row.id))"
      >
        {{ row['provider'] }}
      </button>
    </template>

    <template #cell(pkey)="{ row }">
      <UiFolio :value="String(row['pkey'])" variant="id" />
    </template>

    <template #cell(status)="{ row }">
      <UiStatusBadge
        :tone="resolveEnabledTone(providerByKey(String(row.id))?.enabled)"
        :label="row['enabled'] === 'on' ? enabledText : disabledText"
      />
    </template>

    <template #cell(health)="{ row }">
      <UiStatusBadge
        :tone="resolveHealthTone(String(row['health']))"
        :label="healthText(String(row['health']))"
      />
    </template>
  </UiDataList>
</template>

<style scoped>
.external-idps-table__select {
  appearance: none;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.external-idps-table__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
