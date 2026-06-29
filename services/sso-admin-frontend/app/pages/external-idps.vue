<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useExternalIdpsList } from '@/composables/useExternalIdpsList'
import { filterProviders } from '@/lib/external-idps/external-idps-list'
import { resolveEnabledTone, resolveHealthTone } from '@/lib/external-idps/external-idps-view-state'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import ExternalIdpsTable from '@/components/external-idps/ExternalIdpsTable.vue'
import type { ExternalIdentityProvider } from '@/types/external-idps.types'

definePageMeta({
  name: 'admin.external-idps',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.external-idps.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-external-idps-principal', () => store.ensureSession())

const { providers, viewState, requestId, isStale, refresh } = useExternalIdpsList()

const providerList = computed<readonly ExternalIdentityProvider[]>(() => providers.value ?? [])
const searchQuery = ref('')
const filtered = computed<readonly ExternalIdentityProvider[]>(() =>
  filterProviders(providerList.value, searchQuery.value),
)

const canWrite = computed<boolean>(() => store.hasPermission('admin.external-idps.write'))
// Delete is double-gated: write + sessions.terminate (the backend also requires the
// session-management role, which the UI cannot see — it is enforced server-side).
const canDelete = computed<boolean>(
  () => canWrite.value && store.hasPermission('admin.sessions.terminate'),
)

const healthLabels = computed<Readonly<Record<string, string>>>(() => ({
  healthy: t('external_idps.health_healthy'),
  unhealthy: t('external_idps.health_unhealthy'),
  unknown: t('external_idps.health_unknown'),
}))

const selectedKey = ref<string | null>(null)
const selectedProvider = computed<ExternalIdentityProvider | null>(
  () => providerList.value.find((p) => p.provider_key === selectedKey.value) ?? null,
)

const successMessage = ref<string | null>(null)

function onSelectProvider(key: string): void {
  selectedKey.value = key
}
function onCloseDrawer(): void {
  selectedKey.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler bodies filled by later tasks (declared once; never renamed):
function onCreateRequested(): void {
  /* Task 10.8 */
}
function onEditRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.8 */
}
function onPreviewRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.9 */
}
function onDeleteRequested(_provider: ExternalIdentityProvider): void {
  /* Task 10.10 */
}
</script>

<template>
  <section class="external-idps" data-page="external-idps" data-admin-shell>
    <header class="external-idps__hero">
      <span class="external-idps__eyebrow">{{ t('external_idps.eyebrow') }}</span>
      <div class="external-idps__heading">
        <div>
          <h1 class="external-idps__title">{{ t('external_idps.title') }}</h1>
          <p class="external-idps__summary">{{ t('external_idps.summary') }}</p>
          <p class="external-idps__principal" data-principal-name>
            {{ t('external_idps.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="external-idps-create"
          @click="onCreateRequested"
        >
          {{ t('external_idps.btn_add') }}
        </UiButton>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="external-idps__success"
      role="status"
      aria-live="polite"
      data-testid="external-idps-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('external_idps.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('external_idps.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('external_idps.eyebrow')"
      :title="t('external_idps.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          size="sm"
          data-testid="external-idps-refresh"
          @click="onRefresh"
        >
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('external_idps.empty_title')"
      :description="t('external_idps.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="external-idps__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <UiFormField id="external-idps-search" :label="t('external_idps.search_label')">
        <UiInput
          id="external-idps-search"
          v-model="searchQuery"
          :placeholder="t('external_idps.search_placeholder')"
          data-testid="external-idps-search"
        />
      </UiFormField>

      <ExternalIdpsTable
        :providers="filtered"
        :caption="t('external_idps.list_caption')"
        :provider-label="t('external_idps.col_provider')"
        :key-label="t('external_idps.col_key')"
        :status-label="t('external_idps.col_status')"
        :health-label="t('external_idps.col_health')"
        :enabled-text="t('external_idps.status_enabled')"
        :disabled-text="t('external_idps.status_disabled')"
        :health-labels="healthLabels"
        @select="onSelectProvider"
      />

      <UiDetailDrawer
        v-if="selectedProvider"
        :open="selectedProvider !== null"
        title-id="external-idp-detail-drawer"
        :title="selectedProvider.display_name"
        :description="selectedProvider.issuer"
        :close-label="t('common.close')"
        wide
        @close="onCloseDrawer"
      >
        <div class="idp-detail" data-testid="external-idp-detail">
          <div class="idp-detail__head">
            <UiStatusBadge
              :tone="resolveEnabledTone(selectedProvider.enabled)"
              :label="
                selectedProvider.enabled
                  ? t('external_idps.status_enabled')
                  : t('external_idps.status_disabled')
              "
            />
            <UiStatusBadge
              :tone="resolveHealthTone(selectedProvider.health_status)"
              :label="
                healthLabels[selectedProvider.health_status ?? 'unknown'] ??
                selectedProvider.health_status ??
                'unknown'
              "
            />
            <UiStatusBadge
              :tone="selectedProvider.has_client_secret ? 'info' : 'neutral'"
              :label="
                selectedProvider.has_client_secret
                  ? t('external_idps.secret_configured')
                  : t('external_idps.secret_not_set')
              "
            />
          </div>
          <dl class="idp-detail__grid">
            <div>
              <dt>{{ t('external_idps.ov_provider_key') }}</dt>
              <dd><UiFolio :value="selectedProvider.provider_key" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_client_id') }}</dt>
              <dd><UiFolio :value="selectedProvider.client_id" variant="id" /></dd>
            </div>
            <div class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_issuer') }}</dt>
              <dd><UiFolio :value="selectedProvider.issuer" variant="id" /></dd>
            </div>
            <div class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_metadata_url') }}</dt>
              <dd><UiFolio :value="selectedProvider.metadata_url" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.authorization_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_authorization_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.authorization_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.token_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_token_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.token_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.userinfo_endpoint" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_userinfo_endpoint') }}</dt>
              <dd><UiFolio :value="selectedProvider.userinfo_endpoint" variant="id" /></dd>
            </div>
            <div v-if="selectedProvider.jwks_uri" class="idp-detail__wide">
              <dt>{{ t('external_idps.ov_jwks_uri') }}</dt>
              <dd><UiFolio :value="selectedProvider.jwks_uri" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_algorithms') }}</dt>
              <dd>{{ (selectedProvider.allowed_algorithms ?? []).join(', ') || '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_scopes') }}</dt>
              <dd>{{ (selectedProvider.scopes ?? []).join(', ') || '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_priority') }}</dt>
              <dd>{{ selectedProvider.priority ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_backup') }}</dt>
              <dd>
                {{ selectedProvider.is_backup ? t('external_idps.on') : t('external_idps.off') }}
              </dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_tls') }}</dt>
              <dd>
                {{
                  selectedProvider.tls_validation_enabled
                    ? t('external_idps.on')
                    : t('external_idps.off')
                }}
              </dd>
            </div>
            <div>
              <dt>{{ t('external_idps.ov_signature') }}</dt>
              <dd>
                {{
                  selectedProvider.signature_validation_enabled
                    ? t('external_idps.on')
                    : t('external_idps.off')
                }}
              </dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.external-idps {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.external-idps__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.external-idps__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.external-idps__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.external-idps__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.external-idps__summary,
.external-idps__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.external-idps__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.external-idps__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.idp-detail {
  display: grid;
  gap: 16px;
}
.idp-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.idp-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.idp-detail__wide {
  grid-column: 1 / -1;
}
.idp-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.idp-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
