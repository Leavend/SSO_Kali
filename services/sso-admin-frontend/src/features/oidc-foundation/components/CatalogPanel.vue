<script setup lang="ts">
import OidcStatusBadge from './OidcStatusBadge.vue'
import type { OidcAlgorithmCatalogItem, OidcClaimCatalogItem, OidcScopeCatalogItem } from '../types'

defineProps<{
  readonly scopes: readonly OidcScopeCatalogItem[]
  readonly claims: readonly OidcClaimCatalogItem[]
  readonly algorithms: readonly OidcAlgorithmCatalogItem[]
}>()
</script>

<template>
  <section class="oidc-panel" aria-labelledby="catalog-title">
    <h2 id="catalog-title">Scope / Claim / Algorithm Catalog</h2>

    <h3>Scopes</h3>
    <div class="oidc-table-wrap">
      <table class="oidc-table">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Label</th>
            <th>Description</th>
            <th>Parity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scope in scopes" :key="scope.name">
            <td class="break-anywhere">{{ scope.name }}</td>
            <td>{{ scope.label }}</td>
            <td>{{ scope.description }}</td>
            <td><OidcStatusBadge :status="scope.label_status" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Claims</h3>
    <div class="oidc-table-wrap">
      <table class="oidc-table">
        <thead>
          <tr>
            <th>Claim</th>
            <th>Scope dependency</th>
            <th>Sensitivity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="claim in claims" :key="claim.name">
            <td>{{ claim.name }}</td>
            <td>{{ claim.scope_dependency ?? 'Protocol/default' }}</td>
            <td>{{ claim.sensitivity }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Algorithms</h3>
    <div class="oidc-table-wrap">
      <table class="oidc-table">
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Usage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="algorithm in algorithms" :key="algorithm.name">
            <td>{{ algorithm.name }}</td>
            <td>{{ algorithm.usage }}</td>
            <td><OidcStatusBadge :status="algorithm.status" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
