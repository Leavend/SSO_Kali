<script setup lang="ts">
import OidcStatusBadge from './OidcStatusBadge.vue'
import type { OidcAvailabilityEvidence, OidcEndpointAvailability } from '../types'

defineProps<{
  readonly discovery: OidcEndpointAvailability
  readonly jwks: OidcEndpointAvailability
  readonly timeline: readonly OidcAvailabilityEvidence[]
}>()
</script>

<template>
  <section class="oidc-panel" aria-labelledby="availability-title">
    <h2 id="availability-title">Availability Evidence</h2>
    <div class="oidc-card-grid">
      <article
        v-for="endpoint in [discovery, jwks]"
        :key="endpoint.name"
        class="oidc-evidence-card"
      >
        <h3>{{ endpoint.name }}</h3>
        <OidcStatusBadge :status="endpoint.status" />
        <p>HTTP status: {{ endpoint.http_status ?? 'Belum tersedia' }}</p>
        <p>
          Latency:
          {{ endpoint.latency_ms === null ? 'Belum tersedia' : `${endpoint.latency_ms}ms` }}
        </p>
        <p>Last check: {{ endpoint.last_checked_at ?? 'Belum tersedia' }}</p>
      </article>
    </div>

    <h3>SLI Smoke/Drill Evidence Timeline</h3>
    <p v-if="timeline.length === 0">Belum ada SLI smoke/drill evidence yang tercatat.</p>
    <ul v-else class="oidc-timeline">
      <li v-for="item in timeline" :key="`${item.label}-${item.checked_at}`">
        <OidcStatusBadge :status="item.status" /> {{ item.label }} —
        {{ item.checked_at ?? 'Belum tersedia' }}
      </li>
    </ul>
  </section>
</template>
