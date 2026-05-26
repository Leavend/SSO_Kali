<script setup lang="ts">
import type { OidcDiscoveryMetadata } from '../types'

defineProps<{
  readonly discovery: OidcDiscoveryMetadata
}>()
</script>

<template>
  <section class="oidc-panel" aria-labelledby="discovery-title">
    <h2 id="discovery-title">Discovery Metadata</h2>
    <dl class="oidc-field-list">
      <div>
        <dt>Issuer</dt>
        <dd class="break-anywhere">{{ discovery.issuer }}</dd>
      </div>
      <div>
        <dt>Authorization endpoint</dt>
        <dd class="break-anywhere">{{ discovery.authorization_endpoint }}</dd>
      </div>
      <div>
        <dt>Token endpoint</dt>
        <dd class="break-anywhere">{{ discovery.token_endpoint }}</dd>
      </div>
      <div>
        <dt>JWKS URI</dt>
        <dd class="break-anywhere">{{ discovery.jwks_uri }}</dd>
      </div>
      <div>
        <dt>UserInfo endpoint</dt>
        <dd class="break-anywhere">{{ discovery.userinfo_endpoint }}</dd>
      </div>
      <div>
        <dt>Response types</dt>
        <dd>{{ discovery.response_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>Grant types</dt>
        <dd>{{ discovery.grant_types_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>Scopes</dt>
        <dd>{{ discovery.scopes_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>Claims</dt>
        <dd>{{ discovery.claims_supported.join(', ') }}</dd>
      </div>
      <div>
        <dt>Signing algorithms</dt>
        <dd>{{ discovery.id_token_signing_alg_values_supported.join(', ') }}</dd>
      </div>
    </dl>
  </section>
</template>
