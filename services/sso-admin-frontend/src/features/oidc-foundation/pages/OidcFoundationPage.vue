<script setup lang="ts">
import { onMounted } from 'vue'
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

onMounted(() => {
  void oidcFoundation.load()
})
</script>

<template>
  <section class="oidc-foundation-page">
    <div class="oidc-foundation-layout">
      <header class="hero-card oidc-hero">
        <span class="eyebrow">OIDC Foundation</span>
        <h1>Protocol Health dan Evidence FR-001–FR-005.</h1>
        <p>
          Read-only admin surface untuk Discovery, JWKS, availability, catalog, issuer, dan endpoint
          consistency. Backend tetap menjadi source of truth.
        </p>
      </header>

      <UiSkeleton
        v-if="oidcFoundation.status === 'loading' || oidcFoundation.status === 'idle'"
        label="Memuat OIDC Foundation"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'forbidden'"
        tone="forbidden"
        eyebrow="OIDC Foundation"
        title="Akses OIDC Foundation ditolak"
        :description="
          oidcFoundation.errorMessage ?? 'Kamu tidak memiliki izin untuk melihat OIDC Foundation.'
        "
        :standalone="false"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'unauthenticated'"
        tone="error"
        eyebrow="Session"
        title="Sesi admin berakhir"
        :description="oidcFoundation.errorMessage ?? 'Login ulang dari portal untuk melanjutkan.'"
        :standalone="false"
      />
      <UiStatusView
        v-else-if="oidcFoundation.status === 'error'"
        tone="api"
        eyebrow="Admin API"
        title="OIDC Foundation belum bisa dimuat"
        :description="oidcFoundation.errorMessage ?? 'Coba lagi beberapa saat lagi.'"
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
