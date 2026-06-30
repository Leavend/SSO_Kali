<!-- app/pages/oidc-foundation.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useOidcFoundation } from '@/composables/useOidcFoundation'
import OidcDiscoveryPanel, {
  type OidcDiscoveryLabels,
} from '@/components/oidc-foundation/OidcDiscoveryPanel.vue'
import OidcJwksPanel, { type OidcJwksLabels } from '@/components/oidc-foundation/OidcJwksPanel.vue'
import OidcCatalogPanel, {
  type OidcCatalogLabels,
} from '@/components/oidc-foundation/OidcCatalogPanel.vue'
import OidcAvailabilityPanel, {
  type OidcAvailabilityLabels,
} from '@/components/oidc-foundation/OidcAvailabilityPanel.vue'
import OidcConsistencyPanel, {
  type OidcConsistencyLabels,
} from '@/components/oidc-foundation/OidcConsistencyPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiFolio from '@/components/ui/UiFolio.vue'

definePageMeta({
  name: 'admin.oidc-foundation',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-oidc-foundation-principal', () => store.ensureSession())

const { snapshot, viewState, requestId, refresh } = useOidcFoundation()

const discoveryLabels = computed<OidcDiscoveryLabels>(() => ({
  title: t('oidc.discovery_title'),
  issuer: t('oidc.discovery_issuer'),
  authorization: t('oidc.discovery_authorization'),
  token: t('oidc.discovery_token'),
  jwksUri: t('oidc.discovery_jwks_uri'),
  userinfo: t('oidc.discovery_userinfo'),
  responseTypes: t('oidc.discovery_response_types'),
  grantTypes: t('oidc.discovery_grant_types'),
  scopes: t('oidc.discovery_scopes'),
  claims: t('oidc.discovery_claims'),
  signingAlgs: t('oidc.discovery_signing_algs'),
}))

const jwksLabels = computed<OidcJwksLabels>(() => ({
  title: t('oidc.jwks_title'),
  caption: t('oidc.jwks_caption'),
  kid: t('oidc.jwks_kid'),
  alg: t('oidc.jwks_alg'),
  use: t('oidc.jwks_use'),
  status: t('oidc.jwks_status'),
  published: t('oidc.jwks_published'),
  rotated: t('oidc.jwks_rotated'),
}))

const availabilityLabels = computed<OidcAvailabilityLabels>(() => ({
  title: t('oidc.availability_title'),
  httpStatus: t('oidc.availability_http'),
  latency: t('oidc.availability_latency'),
  lastChecked: t('oidc.availability_last_checked'),
  rotationTitle: t('oidc.availability_rotation_title'),
  rotationEnvironment: t('oidc.availability_rotation_environment'),
  rotationDrill: t('oidc.availability_rotation_drill'),
  rotationSignoff: t('oidc.availability_rotation_signoff'),
  timelineTitle: t('oidc.availability_timeline_title'),
}))

const consistencyLabels = computed<OidcConsistencyLabels>(() => ({
  title: t('oidc.consistency_title'),
  issuerTitle: t('oidc.consistency_issuer_title'),
  configured: t('oidc.consistency_configured'),
  discovered: t('oidc.consistency_discovered'),
  publicBase: t('oidc.consistency_public_base'),
  lastChecked: t('oidc.consistency_last_checked'),
  endpointTitle: t('oidc.consistency_endpoint_title'),
  caption: t('oidc.consistency_caption'),
  name: t('oidc.consistency_name'),
  discoveredUrl: t('oidc.consistency_discovered_url'),
  expectedUrl: t('oidc.consistency_expected_url'),
  status: t('oidc.consistency_status'),
}))

const catalogLabels = computed<OidcCatalogLabels>(() => ({
  title: t('oidc.catalog_title'),
  scopesTitle: t('oidc.catalog_scopes_title'),
  claimsTitle: t('oidc.catalog_claims_title'),
  algorithmsTitle: t('oidc.catalog_algorithms_title'),
  scopeName: t('oidc.catalog_scope_name'),
  scopeLabel: t('oidc.catalog_scope_label'),
  scopeDescription: t('oidc.catalog_scope_description'),
  scopeStatus: t('oidc.catalog_scope_status'),
  claimName: t('oidc.catalog_claim_name'),
  claimScope: t('oidc.catalog_claim_scope'),
  claimSensitivity: t('oidc.catalog_claim_sensitivity'),
  algName: t('oidc.catalog_alg_name'),
  algUsage: t('oidc.catalog_alg_usage'),
  algStatus: t('oidc.catalog_alg_status'),
  captionScopes: t('oidc.catalog_caption_scopes'),
  captionClaims: t('oidc.catalog_caption_claims'),
  captionAlgorithms: t('oidc.catalog_caption_algorithms'),
}))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="oidc" data-page="oidc-foundation" data-admin-shell>
    <header class="oidc__hero">
      <span class="oidc__eyebrow">{{ t('oidc.eyebrow') }}</span>
      <h1 class="oidc__title">{{ t('oidc.title') }}</h1>
      <p class="oidc__summary">{{ t('oidc.summary') }}</p>
      <p class="oidc__principal" data-principal-name>
        {{ t('oidc.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="8" :label="t('oidc.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('oidc.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('oidc.eyebrow')"
      :title="t('oidc.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="oidc-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else-if="snapshot">
      <div class="oidc__overview">
        <div>
          <span class="oidc__overview-label">{{ t('oidc.overview_checked_at') }}</span>
          <UiFolio :value="snapshot.checked_at" variant="timestamp" />
        </div>
        <div v-if="snapshot.correlation_id">
          <span class="oidc__overview-label">{{ t('oidc.overview_correlation_id') }}</span>
          <UiFolio :value="snapshot.correlation_id" variant="id" />
        </div>
      </div>

      <OidcDiscoveryPanel :discovery="snapshot.discovery" :labels="discoveryLabels" />
      <OidcJwksPanel :keys="snapshot.jwks.keys" :labels="jwksLabels" />
      <OidcAvailabilityPanel
        :availability="snapshot.availability"
        :evidence="snapshot.evidence"
        :labels="availabilityLabels"
      />
      <OidcConsistencyPanel
        :issuer-consistency="snapshot.issuer_consistency"
        :endpoint-consistency="snapshot.endpoint_consistency"
        :labels="consistencyLabels"
      />
      <OidcCatalogPanel :catalog="snapshot.catalog" :labels="catalogLabels" />
    </template>
  </section>
</template>

<style scoped>
.oidc {
  display: grid;
  gap: 20px;
  padding: 24px;
}
.oidc__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.oidc__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.oidc__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.oidc__summary,
.oidc__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.oidc__overview {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.oidc__overview-label {
  display: block;
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-bottom: 4px;
}
</style>
