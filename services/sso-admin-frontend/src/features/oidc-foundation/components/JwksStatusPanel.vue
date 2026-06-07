<script setup lang="ts">
import { useDateFormat } from '@/composables/useDateFormat'
import OidcStatusBadge from './OidcStatusBadge.vue'
import type { OidcJwksKey, OidcRotationEvidence } from '../types'

defineProps<{
  readonly keys: readonly OidcJwksKey[]
  readonly rotationEvidence: OidcRotationEvidence
}>()
const dateFormat = useDateFormat()
</script>

<template>
  <section class="oidc-panel" aria-labelledby="jwks-title">
    <h2 id="jwks-title">JWKS Public Key Status</h2>
    <p>Public key metadata only. Private signing material is never displayed.</p>
    <p v-if="keys.length === 0">Belum ada public key evidence yang tersedia.</p>
    <div v-else class="oidc-table-wrap">
      <table class="oidc-table">
        <thead>
          <tr>
            <th>kid</th>
            <th>alg</th>
            <th>use</th>
            <th>status</th>
            <th>rotated</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in keys" :key="key.kid || `${key.alg}-${key.use}`">
            <td class="break-anywhere">{{ key.kid }}</td>
            <td>{{ key.alg }}</td>
            <td>{{ key.use }}</td>
            <td><OidcStatusBadge :status="key.status" /></td>
            <td>{{ dateFormat.smart(key.rotated_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <article class="oidc-evidence-card">
      <h3>Rotation Evidence</h3>
      <p>{{ rotationEvidence.label }}</p>
      <dl class="oidc-field-list oidc-field-list--compact">
        <div>
          <dt>Status</dt>
          <dd><OidcStatusBadge :status="rotationEvidence.status" /></dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{{ rotationEvidence.environment ?? 'Belum tersedia' }}</dd>
        </div>
        <div>
          <dt>Latest drill</dt>
          <dd>{{ dateFormat.smart(rotationEvidence.latest_drill_at) }}</dd>
        </div>
        <div>
          <dt>Operator signoff</dt>
          <dd>{{ rotationEvidence.operator_signoff ?? 'Belum tersedia' }}</dd>
        </div>
      </dl>
    </article>
  </section>
</template>
