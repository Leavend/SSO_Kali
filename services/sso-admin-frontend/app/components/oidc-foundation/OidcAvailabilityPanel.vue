<!-- app/components/oidc-foundation/OidcAvailabilityPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import {
  resolveAvailabilityTone,
  resolveEvidenceTone,
} from '@/lib/oidc-foundation/oidc-foundation-view-state'
import type { OidcEndpointAvailability, OidcFoundationSnapshot } from '@/types/oidc-foundation.types'

export type OidcAvailabilityLabels = {
  readonly title: string
  readonly httpStatus: string
  readonly latency: string
  readonly lastChecked: string
  readonly rotationTitle: string
  readonly rotationEnvironment: string
  readonly rotationDrill: string
  readonly rotationSignoff: string
  readonly timelineTitle: string
}

const props = defineProps<{
  readonly availability: OidcFoundationSnapshot['availability']
  readonly evidence: OidcFoundationSnapshot['evidence']
  readonly labels: OidcAvailabilityLabels
}>()

const endpoints = computed<readonly { readonly key: string; readonly value: OidcEndpointAvailability }[]>(
  () => [
    { key: 'discovery', value: props.availability.discovery },
    { key: 'jwks', value: props.availability.jwks },
  ],
)
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-availability" aria-labelledby="oidc-availability-title">
    <h2 id="oidc-availability-title" class="oidc-panel__title">{{ labels.title }}</h2>

    <div v-for="ep in endpoints" :key="ep.key" class="oidc-availability__endpoint">
      <div class="oidc-availability__head">
        <strong>{{ ep.value.name }}</strong>
        <UiStatusBadge
          :data-testid="`oidc-availability-${ep.key}`"
          :tone="resolveAvailabilityTone(ep.value.status)"
          :label="ep.value.status"
        />
      </div>
      <dl class="oidc-availability__metrics">
        <div><dt>{{ labels.httpStatus }}</dt><dd>{{ ep.value.http_status ?? '—' }}</dd></div>
        <div><dt>{{ labels.latency }}</dt><dd>{{ ep.value.latency_ms ?? '—' }}</dd></div>
        <div>
          <dt>{{ labels.lastChecked }}</dt>
          <dd>
            <UiFolio v-if="ep.value.last_checked_at" :value="ep.value.last_checked_at" variant="timestamp" />
            <span v-else>—</span>
          </dd>
        </div>
      </dl>
    </div>

    <section class="oidc-availability__evidence" aria-label="rotation">
      <div class="oidc-availability__head">
        <strong>{{ labels.rotationTitle }}</strong>
        <UiStatusBadge
          :tone="resolveEvidenceTone(evidence.jwks_rotation.status)"
          :label="evidence.jwks_rotation.label"
        />
      </div>
      <dl class="oidc-availability__metrics">
        <div><dt>{{ labels.rotationEnvironment }}</dt><dd>{{ evidence.jwks_rotation.environment ?? '—' }}</dd></div>
        <div>
          <dt>{{ labels.rotationDrill }}</dt>
          <dd>
            <UiFolio v-if="evidence.jwks_rotation.latest_drill_at" :value="evidence.jwks_rotation.latest_drill_at" variant="timestamp" />
            <span v-else>—</span>
          </dd>
        </div>
        <div><dt>{{ labels.rotationSignoff }}</dt><dd>{{ evidence.jwks_rotation.operator_signoff ?? '—' }}</dd></div>
      </dl>
    </section>

    <section class="oidc-availability__evidence" aria-label="timeline">
      <strong class="oidc-panel__subtitle">{{ labels.timelineTitle }}</strong>
      <ul class="oidc-availability__timeline">
        <li v-for="(item, index) in evidence.availability_timeline" :key="index" class="oidc-availability__timeline-item">
          <UiStatusBadge :tone="resolveEvidenceTone(item.status)" :label="item.label" />
          <UiFolio v-if="item.checked_at" :value="item.checked_at" variant="timestamp" />
        </li>
      </ul>
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
.oidc-availability__endpoint,
.oidc-availability__evidence {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.oidc-availability__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.oidc-availability__metrics {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px 16px;
}
.oidc-availability__metrics dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-availability__metrics dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
}
.oidc-availability__timeline {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.oidc-availability__timeline-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
