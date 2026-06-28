<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useClientDetail } from '@/composables/useClientDetail'
import { useScopeCatalog } from '@/composables/useScopeCatalog'
import { resolveClientStatusTone } from '@/lib/clients/clients-view-state'
import { scopeParityWarnings } from '@/lib/clients/client-create-form'
import type { StatusTone } from '@/lib/status-tone'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'

definePageMeta({
  name: 'admin.clients.detail',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.read'],
})

const { t } = useI18n()
const store = useSessionStore()
const route = useRoute()

// route.params.clientId is a PUBLIC OIDC client identifier (a path id), not a
// secret. The composable resolves the masked detail DTO server-side via the BFF;
// the Bearer token stays in the Nitro event.context and never reaches the page or
// window.__NUXT__. The detail DTO carries only `has_secret_hash` — never a secret.
const clientId = computed<string>(() => String(route.params.clientId ?? ''))
const { client, viewState, requestId, refresh } = useClientDetail(clientId)
// Scope catalog fails closed to [] (useScopeCatalog) — the parity banner simply
// never shows when the catalog is unreachable; it never blocks the read surface.
const { scopes: scopeCatalog } = useScopeCatalog()

// canWrite gates the (later-mounted) edit/action controls; this task ships none.
const canWrite = computed<boolean>(() => store.hasPermission('admin.clients.write'))

const headerTitle = computed<string>(
  () => client.value?.display_name || clientId.value || t('clients.title'),
)
const statusTone = computed<StatusTone>(() => resolveClientStatusTone(client.value?.status))
const categoryTone = computed<StatusTone>(() =>
  client.value?.category === 'kepegawaian' ? 'brand' : 'neutral',
)
const categoryLabel = computed<string>(() =>
  client.value?.category === 'kepegawaian'
    ? t('clients.category_staff')
    : t('clients.category_public'),
)
const allowedScopes = computed<readonly string[]>(() => client.value?.allowed_scopes ?? [])
const parityWarnings = computed<readonly string[]>(() =>
  scopeParityWarnings(scopeCatalog.value, allowedScopes.value),
)

function secretHashLabel(stored: boolean | null | undefined): string {
  return stored ? t('clients.val_stored') : t('clients.val_not_available')
}

// client_id is a PUBLIC identifier — copying it carries no secret. Guarded so SSR
// (no navigator/clipboard) is a safe no-op.
function copyClientId(): void {
  if (import.meta.client) void navigator.clipboard?.writeText(clientId.value)
}

async function onRefresh(): Promise<void> {
  await refresh()
}

async function onBack(): Promise<void> {
  await navigateTo({ name: 'admin.clients' })
}

// ponytail: canWrite is computed but used only as a mount-point gate comment for
// 5.11–5.13; suppress the unused-variable lint warning by referencing it once.
void canWrite
</script>

<template>
  <section class="client-detail" data-page="client-detail">
    <header class="client-detail__hero">
      <span class="client-detail__eyebrow">{{ t('clients.eyebrow') }}</span>
      <h1 class="client-detail__title">{{ headerTitle }}</h1>
      <p class="client-detail__principal" data-principal-name>
        {{ t('clients.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
      <!-- client_id is a PUBLIC identifier — rendered as a mono folio (§7.3 raw-id rule). -->
      <p class="client-detail__id">
        <span class="client-detail__id-label">{{ t('clients.col_client_id') }}</span>
        <UiFolio :value="clientId" variant="id" data-client-id />
        <UiButton variant="ghost" size="sm" data-copy-client-id @click="copyClientId">
          {{ t('common.copy') }}
        </UiButton>
      </p>
      <div v-if="client" class="client-detail__badges">
        <UiStatusBadge :tone="statusTone" :label="client.status ?? t('clients.status_unknown')" />
        <UiStatusBadge :tone="categoryTone" :label="categoryLabel" />
      </div>
      <NuxtLink
        class="client-detail__consent"
        data-consent-trail
        :to="{ name: 'admin.authentication-audit', query: { clientId } }"
      >
        {{ t('clients.btn_consent_trail') }}
      </NuxtLink>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('clients.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('clients.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="viewState === 'not_found'"
      :title="t('clients.not_found_title')"
      :description="t('clients.not_found_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onBack">
          {{ t('clients.btn_back') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <div v-else-if="client" class="client-detail__panels">
      <section
        class="client-detail__panel"
        data-panel="overview"
        aria-labelledby="overview-heading"
      >
        <h2 id="overview-heading" class="client-detail__panel-title">
          {{ t('clients.tab_overview') }}
        </h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_type') }}</dt>
            <dd>{{ client.type ?? '—' }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.label_category') }}</dt>
            <dd><UiStatusBadge :tone="categoryTone" :label="categoryLabel" /></dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_owner') }}</dt>
            <dd>{{ client.owner_email ?? '—' }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.col_status') }}</dt>
            <dd>
              <UiStatusBadge
                :tone="statusTone"
                :label="client.status ?? t('clients.status_unknown')"
              />
            </dd>
          </div>
        </dl>
        <!-- 5.11 ClientMetadataForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section class="client-detail__panel" data-panel="uris" aria-labelledby="uris-heading">
        <h2 id="uris-heading" class="client-detail__panel-title">{{ t('clients.tab_uris') }}</h2>
        <h3 class="client-detail__subhead">{{ t('clients.redirect_uris_title') }}</h3>
        <ul v-if="client.redirect_uris.length" class="client-detail__uris">
          <li v-for="uri in client.redirect_uris" :key="uri">{{ uri }}</li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_redirect_uris') }}</p>

        <h3 class="client-detail__subhead">{{ t('clients.logout_uris_title') }}</h3>
        <ul v-if="(client.post_logout_redirect_uris ?? []).length" class="client-detail__uris">
          <li v-for="uri in client.post_logout_redirect_uris" :key="uri">{{ uri }}</li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_logout_uris') }}</p>

        <h3 class="client-detail__subhead">{{ t('clients.backchannel_uri_title') }}</h3>
        <p class="client-detail__value">
          {{ client.backchannel_logout_uri || t('clients.val_not_set') }}
        </p>
        <!-- 5.11 ClientUriPolicyForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section class="client-detail__panel" data-panel="scopes" aria-labelledby="scopes-heading">
        <h2 id="scopes-heading" class="client-detail__panel-title">
          {{ t('clients.tab_scopes') }}
        </h2>
        <p v-if="parityWarnings.length" class="client-detail__warning" role="alert">
          {{ t('clients.scope_parity_warning') }} {{ parityWarnings.join(', ') }}
        </p>
        <ul v-if="allowedScopes.length" class="client-detail__scopes">
          <li v-for="scope in allowedScopes" :key="scope">
            <UiStatusBadge tone="neutral" :label="scope" />
          </li>
        </ul>
        <p v-else class="client-detail__muted">{{ t('clients.no_scopes') }}</p>
        <!-- 5.11 ClientScopePolicyForm mounts here when canWrite (admin.clients.write) -->
      </section>

      <section
        class="client-detail__panel"
        data-panel="security"
        aria-labelledby="security-heading"
      >
        <h2 id="security-heading" class="client-detail__panel-title">
          {{ t('clients.tab_security') }}
        </h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_secret_hash') }}</dt>
            <!-- has_secret_hash is a BOOLEAN — the plaintext secret never reaches this DTO. -->
            <dd>{{ secretHashLabel(client.has_secret_hash) }}</dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.ov_secret_rotated') }}</dt>
            <dd>
              <UiFolio
                v-if="client.secret_rotated_at"
                :value="client.secret_rotated_at"
                variant="timestamp"
              />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
        </dl>
        <!-- 5.12 secret-rotation component mounts here when canWrite (admin.clients.write · step-up) -->
      </section>

      <section
        class="client-detail__panel"
        data-panel="lifecycle"
        aria-labelledby="lifecycle-heading"
      >
        <h2 id="lifecycle-heading" class="client-detail__panel-title">
          {{ t('clients.tab_lifecycle') }}
        </h2>
        <dl class="client-detail__grid">
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_activated') }}</dt>
            <dd>
              <UiFolio
                v-if="client.activated_at"
                :value="client.activated_at"
                variant="timestamp"
              />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
          <div v-if="client.disabled_at" class="client-detail__field">
            <dt>{{ t('clients.lc_disabled') }}</dt>
            <dd>
              <UiFolio :value="client.disabled_at" variant="timestamp" />
            </dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_secret_expires') }}</dt>
            <dd>
              <UiFolio
                v-if="client.secret_expires_at"
                :value="client.secret_expires_at"
                variant="timestamp"
              />
              <span v-else>{{ t('clients.val_not_set') }}</span>
            </dd>
          </div>
          <div class="client-detail__field">
            <dt>{{ t('clients.lc_provisioning') }}</dt>
            <dd>{{ client.provisioning ?? '—' }}</dd>
          </div>
        </dl>
        <!-- 5.13 ClientLifecycleActions mounts here when canWrite + admin.sessions.terminate (step-up) -->
      </section>
    </div>
  </section>
</template>

<style scoped>
.client-detail {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.client-detail__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.client-detail__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.client-detail__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-detail__id {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.client-detail__id-label {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.client-detail__consent {
  justify-self: start;
  font: 600 0.75rem/1 var(--font-sans);
  color: var(--accent);
  text-decoration: none;
}
.client-detail__panels {
  display: grid;
  gap: 20px;
}
.client-detail__panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.client-detail__panel-title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.client-detail__subhead {
  margin: 0;
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__grid {
  display: grid;
  gap: 12px 24px;
  margin: 0;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.client-detail__field {
  display: grid;
  gap: 2px;
}
.client-detail__field dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.client-detail__field dd {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.client-detail__uris,
.client-detail__scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font: 400 0.8125rem/1.5 var(--font-mono);
  overflow-wrap: anywhere;
}
.client-detail__scopes {
  font-family: var(--font-sans);
}
.client-detail__value {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-mono);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.client-detail__warning {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--border);
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.client-detail__muted {
  margin: 0;
  font: 400 0.875rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
</style>
