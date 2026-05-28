<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useExternalIdpsStore } from '../stores/external-idps.store'

const store = useExternalIdpsStore()
const mappingClaims = ref('{"sub":"ext-user-123","email":"user@example.com"}')

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

async function previewMapping(): Promise<void> {
  const parsed = JSON.parse(mappingClaims.value) as Record<string, unknown>
  await store.previewSelectedMapping(parsed)
}
</script>

<template>
  <section class="external-idps-page" aria-labelledby="idp-title">
    <div class="page-heading">
      <p class="eyebrow">Federation</p>
      <h1 id="idp-title">External IdPs</h1>
      <p class="page-summary">
        Konfigurasi provider identitas eksternal, health, mapping, dan failover controls.
      </p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat provider...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses External IdP ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>External IdP admin belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else class="idp-layout">
      <section class="detail-section" aria-labelledby="idp-list-title">
        <h2 id="idp-list-title">Provider list</h2>
        <div v-for="provider in store.providers" :key="provider.provider_key" class="state-card">
          <strong>{{ provider.display_name }}</strong>
          <p>{{ provider.provider_key }} · {{ provider.issuer }}</p>
          <p>
            {{ provider.enabled ? 'enabled' : 'disabled' }} · health
            {{ provider.health_status ?? 'unknown' }}
          </p>
          <p>
            Priority: {{ provider.priority ?? 100 }} ·
            {{ provider.is_backup ? 'backup' : 'primary' }}
          </p>
        </div>
        <p v-if="store.providers.length === 0" class="muted">Belum ada provider.</p>
      </section>

      <section
        v-if="store.selectedProvider"
        class="detail-section"
        aria-labelledby="idp-detail-title"
      >
        <h2 id="idp-detail-title">Provider detail</h2>
        <div class="state-card">
          <strong>{{ store.selectedProvider.display_name }}</strong>
          <p>client_id: {{ store.selectedProvider.client_id }}</p>
          <p>issuer: {{ store.selectedProvider.issuer }}</p>
          <p>metadata_url: {{ store.selectedProvider.metadata_url }}</p>
          <p v-if="store.selectedProvider.jwks_uri">
            jwks_uri: {{ store.selectedProvider.jwks_uri }}
          </p>
          <p v-if="store.selectedProvider.authorization_endpoint">
            authorization_endpoint: {{ store.selectedProvider.authorization_endpoint }}
          </p>
          <p v-if="store.selectedProvider.token_endpoint">
            token_endpoint: {{ store.selectedProvider.token_endpoint }}
          </p>
          <p>
            algorithms: {{ (store.selectedProvider.allowed_algorithms ?? ['RS256']).join(', ') }}
          </p>
          <p>scopes: {{ (store.selectedProvider.scopes ?? ['openid']).join(', ') }}</p>
          <p>client credential configured: {{ store.selectedProvider.has_client_secret }}</p>
          <p>tls_validation: {{ store.selectedProvider.tls_validation_enabled }}</p>
          <p>signature_validation: {{ store.selectedProvider.signature_validation_enabled }}</p>
          <div class="action-row compact-actions">
            <button
              class="danger-action"
              type="button"
              @click="store.updateSelected({ enabled: false })"
            >
              Disable provider
            </button>
            <button
              class="primary-action"
              type="button"
              @click="store.updateSelected({ enabled: true, is_backup: true })"
            >
              Mark backup failover
            </button>
          </div>
          <div
            v-if="store.selectedProvider.consecutive_failures"
            class="state-card state-card--danger"
          >
            <p>consecutive_failures: {{ store.selectedProvider.consecutive_failures }}</p>
            <p v-if="store.selectedProvider.breaker_tripped_at">
              breaker_tripped_at: {{ store.selectedProvider.breaker_tripped_at }}
            </p>
            <p v-if="store.selectedProvider.breaker_reason">
              breaker_reason: {{ store.selectedProvider.breaker_reason }}
            </p>
          </div>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="idp-mapping-title">
        <h2 id="idp-mapping-title">Mapping preview</h2>
        <label class="reason-field">
          Sample claims JSON
          <textarea v-model="mappingClaims" rows="4" />
        </label>
        <button class="primary-action" type="button" @click="previewMapping">
          Preview mapping
        </button>
        <div v-if="store.mappingPreview" class="state-card">
          <p>safe to link: {{ store.mappingPreview.safe_to_link }}</p>
          <p>missing_email_strategy: {{ store.mappingPreview.missing_email_strategy }}</p>
          <div v-if="store.mappingPreview.mapped">
            <pre class="policy-json">{{
              JSON.stringify(store.mappingPreview.mapped, null, 2)
            }}</pre>
          </div>
          <ul v-if="store.mappingPreview.warnings.length > 0">
            <li v-for="warning in store.mappingPreview.warnings" :key="warning" class="muted">
              {{ warning }}
            </li>
          </ul>
          <ul v-if="store.mappingPreview.errors.length > 0">
            <li
              v-for="error in store.mappingPreview.errors"
              :key="error"
              class="state-card--danger"
            >
              {{ error }}
            </li>
          </ul>
        </div>
      </section>

      <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
    </div>

    <p v-if="store.requestId" class="request-evidence">Request ID: {{ store.requestId }}</p>
  </section>
</template>
