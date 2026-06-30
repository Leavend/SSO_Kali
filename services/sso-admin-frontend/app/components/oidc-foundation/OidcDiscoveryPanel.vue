<!-- app/components/oidc-foundation/OidcDiscoveryPanel.vue -->
<script setup lang="ts">
import type { OidcDiscoveryMetadata } from '@/types/oidc-foundation.types'

export type OidcDiscoveryLabels = {
  readonly title: string
  readonly issuer: string
  readonly authorization: string
  readonly token: string
  readonly jwksUri: string
  readonly userinfo: string
  readonly responseTypes: string
  readonly grantTypes: string
  readonly scopes: string
  readonly claims: string
  readonly signingAlgs: string
}

defineProps<{
  readonly discovery: OidcDiscoveryMetadata
  readonly labels: OidcDiscoveryLabels
}>()
</script>

<template>
  <section class="oidc-panel" data-testid="oidc-discovery" aria-labelledby="oidc-discovery-title">
    <h2 id="oidc-discovery-title" class="oidc-panel__title">{{ labels.title }}</h2>
    <dl class="oidc-panel__grid">
      <div class="oidc-panel__wide">
        <dt>{{ labels.issuer }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.issuer }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.authorization }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.authorization_endpoint }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.token }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.token_endpoint }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.jwksUri }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.jwks_uri }}</dd>
      </div>
      <div class="oidc-panel__wide">
        <dt>{{ labels.userinfo }}</dt>
        <dd class="oidc-panel__mono">{{ discovery.userinfo_endpoint }}</dd>
      </div>
      <div>
        <dt>{{ labels.responseTypes }}</dt>
        <dd>{{ discovery.response_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.grantTypes }}</dt>
        <dd>{{ discovery.grant_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.scopes }}</dt>
        <dd>{{ discovery.scopes_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.claims }}</dt>
        <dd>{{ discovery.claims_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>{{ labels.signingAlgs }}</dt>
        <dd>{{ discovery.id_token_signing_alg_values_supported.join(', ') }}</dd>
      </div>
    </dl>
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
.oidc-panel__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.oidc-panel__wide {
  grid-column: 1 / -1;
}
.oidc-panel__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc-panel__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.oidc-panel__mono {
  font-family: var(--font-mono, monospace);
}
</style>
