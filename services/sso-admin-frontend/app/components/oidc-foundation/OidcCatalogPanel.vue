<!-- app/components/oidc-foundation/OidcCatalogPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { resolveScopeLabelTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcFoundationSnapshot, ScopeLabelStatus } from '@/types/oidc-foundation.types'

export type OidcCatalogLabels = {
  readonly title: string
  readonly scopesTitle: string
  readonly claimsTitle: string
  readonly algorithmsTitle: string
  readonly scopeName: string
  readonly scopeLabel: string
  readonly scopeDescription: string
  readonly scopeStatus: string
  readonly claimName: string
  readonly claimScope: string
  readonly claimSensitivity: string
  readonly algName: string
  readonly algUsage: string
  readonly algStatus: string
  readonly captionScopes: string
  readonly captionClaims: string
  readonly captionAlgorithms: string
}

const props = defineProps<{
  readonly catalog: OidcFoundationSnapshot['catalog']
  readonly labels: OidcCatalogLabels
}>()

const scopeColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.scopeName, align: 'left' },
  { key: 'label', label: props.labels.scopeLabel, align: 'left' },
  { key: 'description', label: props.labels.scopeDescription, align: 'left' },
  { key: 'status', label: props.labels.scopeStatus, align: 'left' },
])
const scopeRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.scopes.map((scope) => ({
    id: scope.name,
    name: scope.name,
    label: scope.label,
    description: scope.description,
    status: scope.label_status,
  })),
)

const claimColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.claimName, align: 'left' },
  { key: 'scope', label: props.labels.claimScope, align: 'left' },
  { key: 'sensitivity', label: props.labels.claimSensitivity, align: 'left' },
])
const claimRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.claims.map((claim) => ({
    id: claim.name,
    name: claim.name,
    scope: claim.scope_dependency ?? '—',
    sensitivity: claim.sensitivity,
  })),
)

const algColumns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.algName, align: 'left' },
  { key: 'usage', label: props.labels.algUsage, align: 'left' },
  { key: 'status', label: props.labels.algStatus, align: 'left' },
])
const algRows = computed<readonly UiDataListRow[]>(() =>
  props.catalog.algorithms.map((alg) => ({
    id: alg.name,
    name: alg.name,
    usage: alg.usage,
    status: alg.status,
  })),
)

function scopeTone(status: string): ReturnType<typeof resolveScopeLabelTone> {
  return resolveScopeLabelTone(status as ScopeLabelStatus)
}
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-catalog" aria-labelledby="oidc-catalog-title">
    <h2 id="oidc-catalog-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <h3 class="oidc-panel__subtitle">{{ labels.scopesTitle }}</h3>
    <UiDataList :caption="labels.captionScopes" :columns="scopeColumns" :rows="scopeRows">
      <template #cell(status)="{ row }">
        <UiStatusBadge :tone="scopeTone(String(row['status']))" :label="String(row['status'])" />
      </template>
    </UiDataList>

    <h3 class="oidc-panel__subtitle">{{ labels.claimsTitle }}</h3>
    <UiDataList :caption="labels.captionClaims" :columns="claimColumns" :rows="claimRows" />

    <h3 class="oidc-panel__subtitle">{{ labels.algorithmsTitle }}</h3>
    <UiDataList :caption="labels.captionAlgorithms" :columns="algColumns" :rows="algRows">
      <template #cell(status)="{ row }">
        <UiStatusBadge :status="String(row['status'])" />
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
.oidc-panel__subtitle {
  margin: 8px 0 0;
  font: 600 0.75rem/1.3 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-3);
}
</style>
