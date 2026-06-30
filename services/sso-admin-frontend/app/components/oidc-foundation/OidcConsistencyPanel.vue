<!-- app/components/oidc-foundation/OidcConsistencyPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import { resolveConsistencyTone } from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type {
  OidcConsistencyStatus,
  OidcEndpointConsistency,
  OidcIssuerConsistency,
} from '@/types/oidc-foundation.types'

export type OidcConsistencyLabels = {
  readonly title: string
  readonly issuerTitle: string
  readonly configured: string
  readonly discovered: string
  readonly publicBase: string
  readonly lastChecked: string
  readonly endpointTitle: string
  readonly caption: string
  readonly name: string
  readonly discoveredUrl: string
  readonly expectedUrl: string
  readonly status: string
}

const props = defineProps<{
  readonly issuerConsistency: OidcIssuerConsistency
  readonly endpointConsistency: readonly OidcEndpointConsistency[]
  readonly labels: OidcConsistencyLabels
}>()

const columns = computed<readonly UiDataListColumn[]>(() => [
  { key: 'name', label: props.labels.name, align: 'left' },
  { key: 'discovered', label: props.labels.discoveredUrl, align: 'left' },
  { key: 'expected', label: props.labels.expectedUrl, align: 'left' },
  { key: 'status', label: props.labels.status, align: 'left' },
])
const rows = computed<readonly UiDataListRow[]>(() =>
  props.endpointConsistency.map((endpoint) => ({
    id: endpoint.name,
    name: endpoint.name,
    discovered: endpoint.discovered_url,
    expected: endpoint.expected_url,
    status: endpoint.status,
  })),
)

function endpointTone(status: string): ReturnType<typeof resolveConsistencyTone> {
  return resolveConsistencyTone(status as OidcConsistencyStatus)
}
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-consistency" aria-labelledby="oidc-consistency-title">
    <h2 id="oidc-consistency-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <section class="oidc-consistency__issuer" aria-label="issuer">
      <div class="oidc-consistency__head">
        <strong>{{ labels.issuerTitle }}</strong>
        <UiStatusBadge
          data-testid="oidc-issuer-status"
          :tone="resolveConsistencyTone(issuerConsistency.status)"
          :label="issuerConsistency.status"
        />
      </div>
      <dl class="oidc-consistency__grid">
        <div class="oidc-consistency__wide">
          <dt>{{ labels.configured }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.configured_issuer }}</dd>
        </div>
        <div class="oidc-consistency__wide">
          <dt>{{ labels.discovered }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.discovery_issuer }}</dd>
        </div>
        <div class="oidc-consistency__wide">
          <dt>{{ labels.publicBase }}</dt>
          <dd class="oidc-consistency__mono">{{ issuerConsistency.public_base_url }}</dd>
        </div>
        <div>
          <dt>{{ labels.lastChecked }}</dt>
          <dd><UiFolio :value="issuerConsistency.last_checked_at" variant="timestamp" /></dd>
        </div>
      </dl>
    </section>

    <section class="oidc-consistency__endpoints" aria-label="endpoints">
      <strong class="oidc-panel__subtitle">{{ labels.endpointTitle }}</strong>
      <UiDataList :caption="labels.caption" :columns="columns" :rows="rows">
        <template #cell(status)="{ row }">
          <UiStatusBadge :tone="endpointTone(String(row['status']))" :label="String(row['status'])" />
        </template>
      </UiDataList>
    </section>
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
  font: 600 0.75rem/1.3 var(--font-sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-consistency__issuer,
.oidc-consistency__endpoints {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.oidc-consistency__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.oidc-consistency__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.oidc-consistency__wide {
  grid-column: 1 / -1;
}
.oidc-consistency__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-consistency__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.oidc-consistency__mono {
  font-family: var(--font-mono, monospace);
}
</style>
