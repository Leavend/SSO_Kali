<script setup lang="ts">
import { useDateFormat } from '@/composables/useDateFormat'
import { formatTechnicalPreview } from '@/lib/display-identifiers'
import OidcStatusBadge from './OidcStatusBadge.vue'
import type { OidcFoundationSnapshot } from '../types'

defineProps<{
  readonly snapshot: OidcFoundationSnapshot
}>()
const dateFormat = useDateFormat()
</script>

<template>
  <section class="oidc-panel oidc-overview" aria-labelledby="oidc-overview-title">
    <div>
      <span class="eyebrow">FR-001–FR-005</span>
      <h2 id="oidc-overview-title">OIDC Foundation Overview</h2>
      <p>
        Read-only operational evidence untuk Discovery, JWKS, availability, catalog, issuer, dan
        endpoint consistency.
      </p>
    </div>

    <dl class="oidc-summary-grid">
      <div>
        <dt>Issuer</dt>
        <dd class="break-anywhere">{{ snapshot.discovery.issuer }}</dd>
      </div>
      <div>
        <dt>Issuer consistency</dt>
        <dd><OidcStatusBadge :status="snapshot.issuer_consistency.status" /></dd>
      </div>
      <div>
        <dt>Discovery availability</dt>
        <dd><OidcStatusBadge :status="snapshot.availability.discovery.status" /></dd>
      </div>
      <div>
        <dt>JWKS availability</dt>
        <dd><OidcStatusBadge :status="snapshot.availability.jwks.status" /></dd>
      </div>
      <div>
        <dt>JWKS rotation evidence</dt>
        <dd><OidcStatusBadge :status="snapshot.evidence.jwks_rotation.status" /></dd>
      </div>
      <div>
        <dt>Checked at</dt>
        <dd>{{ dateFormat.smart(snapshot.checked_at) }}</dd>
      </div>
      <div v-if="snapshot.correlation_id">
        <dt>Kode referensi</dt>
        <dd class="break-anywhere">{{ formatTechnicalPreview(snapshot.correlation_id) }}</dd>
      </div>
    </dl>
  </section>
</template>
