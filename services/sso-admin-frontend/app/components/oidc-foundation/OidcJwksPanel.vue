<!-- app/components/oidc-foundation/OidcJwksPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { resolveJwksKeyTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcJwksKey } from '@/types/oidc-foundation.types'

export type OidcJwksLabels = {
  readonly title: string
  readonly caption: string
  readonly kid: string
  readonly alg: string
  readonly use: string
  readonly status: string
  readonly published: string
  readonly rotated: string
}

const props = defineProps<{
  readonly keys: readonly OidcJwksKey[]
  readonly labels: OidcJwksLabels
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'kid', label: props.labels.kid, align: 'left', variant: 'id' },
  { key: 'alg', label: props.labels.alg, align: 'left' },
  { key: 'use', label: props.labels.use, align: 'left' },
  { key: 'status', label: props.labels.status, align: 'left' },
  { key: 'published', label: props.labels.published, align: 'left', variant: 'timestamp' },
  { key: 'rotated', label: props.labels.rotated, align: 'left', variant: 'timestamp' },
])

const rows = computed<readonly UiDataListRow[]>(() =>
  props.keys.map((key) => ({
    id: key.kid,
    kid: key.kid,
    alg: key.alg,
    use: key.use,
    status: key.status,
    published: key.published_at ?? '—',
    rotated: key.rotated_at ?? '—',
  })),
)
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-jwks" aria-labelledby="oidc-jwks-title">
    <h2 id="oidc-jwks-title" class="oidc-panel__title">{{ labels.title }}</h2>
    <UiDataList :caption="labels.caption" :columns="columns" :rows="rows">
      <template #cell(status)="{ row }">
        <UiStatusBadge
          :tone="resolveJwksKeyTone(String(row['status']))"
          :label="String(row['status'])"
        />
      </template>
    </UiDataList>
  </section>
</template>

<style scoped>
.oidc-panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.oidc-panel__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
</style>
