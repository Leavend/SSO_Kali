<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import AvailabilityEvidencePanel from '../components/AvailabilityEvidencePanel.vue'
import CatalogPanel from '../components/CatalogPanel.vue'
import DiscoveryMetadataPanel from '../components/DiscoveryMetadataPanel.vue'
import EndpointConsistencyPanel from '../components/EndpointConsistencyPanel.vue'
import JwksStatusPanel from '../components/JwksStatusPanel.vue'
import OidcFoundationOverview from '../components/OidcFoundationOverview.vue'
import { useOidcFoundationStore } from '../stores/oidcFoundation.store'

const oidcFoundation = useOidcFoundationStore()
const { t } = useI18n()

onMounted(() => {
  void oidcFoundation.load()
})
</script>

<template>
  <section class="oidc-foundation-page max-w-page mx-auto px-4 md:px-6 py-8">
    <div class="oidc-foundation-layout">
      <header class="hero-card oidc-hero">
        <span class="eyebrow">{{ t('oidc.eyebrow') }}</span>
        <h1>{{ t('oidc.title') }}</h1>
        <p>{{ t('oidc.summary') }}</p>
      </header>

      <UiSkeleton
        v-if="oidcFoundation.status === 'loading' || oidcFoundation.status === 'idle'"
        :label="t('oidc.loading')"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'forbidden'"
        tone="forbidden"
        eyebrow="OIDC Foundation"
        :title="t('oidc.forbidden_title')"
        :description="oidcFoundation.errorMessage ?? t('common.forbidden_desc')"
        :standalone="false"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'unauthenticated'"
        tone="error"
        eyebrow="Session"
        :title="t('common.session_expired_title')"
        :description="oidcFoundation.errorMessage ?? t('common.session_expired_desc')"
        :standalone="false"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'error'"
        tone="api"
        eyebrow="Admin API"
        :title="t('oidc.error_title')"
        :description="oidcFoundation.errorMessage ?? t('common.error_loading_desc')"
        :standalone="false"
      />
      <template v-else-if="oidcFoundation.snapshot">
        <OidcFoundationOverview :snapshot="oidcFoundation.snapshot" />
        <DiscoveryMetadataPanel :discovery="oidcFoundation.snapshot.discovery" />
        <JwksStatusPanel
          :keys="oidcFoundation.snapshot.jwks.keys"
          :rotation-evidence="oidcFoundation.snapshot.evidence.jwks_rotation"
        />
        <AvailabilityEvidencePanel
          :discovery="oidcFoundation.snapshot.availability.discovery"
          :jwks="oidcFoundation.snapshot.availability.jwks"
          :timeline="oidcFoundation.snapshot.evidence.availability_timeline"
        />
        <CatalogPanel
          :scopes="oidcFoundation.snapshot.catalog.scopes"
          :claims="oidcFoundation.snapshot.catalog.claims"
          :algorithms="oidcFoundation.snapshot.catalog.algorithms"
        />
        <EndpointConsistencyPanel
          :issuer="oidcFoundation.snapshot.issuer_consistency"
          :endpoints="oidcFoundation.snapshot.endpoint_consistency"
        />
      </template>
    </div>
  </section>
</template>
