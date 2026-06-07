<script setup lang="ts">
import { useDateFormat } from '@/composables/useDateFormat'
import OidcStatusBadge from './OidcStatusBadge.vue'
import type { OidcEndpointConsistency, OidcIssuerConsistency } from '../types'

defineProps<{
  readonly issuer: OidcIssuerConsistency
  readonly endpoints: readonly OidcEndpointConsistency[]
}>()
const dateFormat = useDateFormat()
</script>

<template>
  <section class="oidc-panel" aria-labelledby="consistency-title">
    <h2 id="consistency-title">Endpoint Consistency</h2>
    <dl class="oidc-field-list">
      <div>
        <dt>Configured issuer</dt>
        <dd class="break-anywhere">{{ issuer.configured_issuer }}</dd>
      </div>
      <div>
        <dt>Discovery issuer</dt>
        <dd class="break-anywhere">{{ issuer.discovery_issuer }}</dd>
      </div>
      <div>
        <dt>Public base URL</dt>
        <dd class="break-anywhere">{{ issuer.public_base_url }}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd><OidcStatusBadge :status="issuer.status" /></dd>
      </div>
      <div>
        <dt>Last checked</dt>
        <dd>{{ dateFormat.smart(issuer.last_checked_at) }}</dd>
      </div>
    </dl>

    <div class="oidc-table-wrap">
      <table class="oidc-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Discovered URL</th>
            <th>Expected URL</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="endpoint in endpoints" :key="endpoint.name">
            <td>{{ endpoint.name }}</td>
            <td class="break-anywhere">{{ endpoint.discovered_url }}</td>
            <td class="break-anywhere">{{ endpoint.expected_url }}</td>
            <td><OidcStatusBadge :status="endpoint.status" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
