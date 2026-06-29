<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSecurityPolicies } from '@/composables/useSecurityPolicies'
import { POLICY_CATEGORIES, findActiveVersion } from '@/lib/policy/policy-helpers'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import PolicyVersionsTable from '@/components/policy/PolicyVersionsTable.vue'
import { resolvePolicyStatusTone } from '@/lib/policy/policy-view-state'
import type { SecurityPolicy, SecurityPolicyCategory } from '@/types/policy.types'

definePageMeta({
  name: 'admin.policy',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.security-policy.read'],
})

const { t } = useI18n()
const store = useSessionStore()

// SAFE HYDRATION: resolve the masked principal server-side. Tokens stay in Nitro
// event.context; the policy DTOs carry no token/secret/PII (payload is non-secret
// config, actor_subject_id is an opaque admin ULID, reason is audit text).
await useAsyncData('admin-policy-principal', () => store.ensureSession())

const category = ref<SecurityPolicyCategory>('password')
const { policies, active, viewState, requestId, isStale, refresh } = useSecurityPolicies(category)

const policyList = computed<readonly SecurityPolicy[]>(() => policies.value ?? [])
const activeVersion = computed<number | null>(() => findActiveVersion(policyList.value))

// UiSelect speaks `string`; this writable proxy keeps the v-model binding
// type-checking while `category` stays the typed Ref passed to the composable
// (mirrors app/pages/clients/new.vue + ComplianceExportPanel.vue).
const categoryModel = computed<string>({
  get: () => category.value,
  set: (value) => {
    category.value = value as SecurityPolicyCategory
  },
})

const categoryOptions = computed(() =>
  POLICY_CATEGORIES.map((c) => ({ value: c, label: t(`policy.category_${c}`) })),
)

const statusLabels = computed<Readonly<Record<string, string>>>(() => ({
  draft: t('policy.status_draft'),
  active: t('policy.status_active'),
  superseded: t('policy.status_superseded'),
  rolled_back: t('policy.status_rolled_back'),
}))

// The active payload, pretty-printed (read surface). Non-secret config only.
const activeJson = computed<string | null>(() =>
  active.value ? JSON.stringify(active.value, null, 2) : null,
)

// Master-detail: selected version drives the read-only drawer.
const selectedId = ref<number | null>(null)
const selectedPolicy = computed<SecurityPolicy | null>(
  () => policyList.value.find((p) => p.id === selectedId.value) ?? null,
)
const selectedJson = computed<string>(() =>
  selectedPolicy.value ? JSON.stringify(selectedPolicy.value.payload, null, 2) : '',
)

// Single page-level success region — reused by propose/activate/rollback (8.7–8.9).
const successMessage = ref<string | null>(null)

function onSelectVersion(id: number): void {
  selectedId.value = id
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onCategoryChange(): Promise<void> {
  selectedId.value = null
  successMessage.value = null
  // The composable refetches via its category watch; nothing else to do.
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Handler bodies filled by later tasks (declared once; never renamed):
function onProposeSubmit(): void {
  /* Task 8.7 */
}
function onActivateRequested(_version: number): void {
  /* Task 8.8 */
}
function onRollbackRequested(_version: number): void {
  /* Task 8.9 */
}
</script>

<template>
  <section class="policy" data-page="policy" data-admin-shell>
    <header class="policy__hero">
      <span class="policy__eyebrow">{{ t('policy.eyebrow') }}</span>
      <div class="policy__heading">
        <h1 class="policy__title">{{ t('policy.title') }}</h1>
        <p class="policy__summary">{{ t('policy.summary') }}</p>
        <p class="policy__principal" data-principal-name>
          {{ t('policy.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
        </p>
      </div>
      <UiFormField id="policy-category" :label="t('policy.label_category')">
        <UiSelect
          id="policy-category"
          v-model="categoryModel"
          :options="categoryOptions"
          @update:model-value="onCategoryChange"
        />
      </UiFormField>
    </header>

    <p
      v-if="successMessage"
      class="policy__success"
      role="status"
      aria-live="polite"
      data-testid="policy-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="5" :label="t('policy.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('policy.eyebrow')"
      :title="t('policy.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('policy.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('policy.eyebrow')"
      :title="t('policy.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="policy-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('policy.empty_title')"
      :description="t('policy.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="policy__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <section class="policy__active" aria-labelledby="policy-active-title">
        <h2 id="policy-active-title" class="policy__h2">{{ t('policy.active_title') }}</h2>
        <pre v-if="activeJson" class="policy-json" data-testid="policy-active-summary">{{
          activeJson
        }}</pre>
        <p v-else class="policy__muted" data-testid="policy-active-summary">
          {{ t('policy.active_none') }}
        </p>
      </section>

      <section class="policy__versions" aria-labelledby="policy-versions-title">
        <h2 id="policy-versions-title" class="policy__h2">{{ t('policy.versions_title') }}</h2>
        <PolicyVersionsTable
          :policies="policyList"
          :caption="t('policy.versions_title')"
          :version-label="t('policy.col_version')"
          :effective-label="t('policy.col_effective')"
          :status-label="t('policy.col_status')"
          :actor-label="t('policy.label_actor')"
          :status-labels="statusLabels"
          @select="onSelectVersion"
        />
      </section>

      <UiDetailDrawer
        v-if="selectedPolicy"
        :open="selectedPolicy !== null"
        title-id="policy-detail-drawer"
        :title="`${selectedPolicy.category} · v${selectedPolicy.version}`"
        :description="t('policy.detail_desc')"
        :close-label="t('policy.close_detail')"
        wide
        @close="onCloseDrawer"
      >
        <div class="policy-detail" data-testid="policy-detail">
          <div class="policy-detail__head">
            <UiStatusBadge
              :tone="resolvePolicyStatusTone(selectedPolicy.status)"
              :label="statusLabels[selectedPolicy.status] ?? selectedPolicy.status"
            />
            <span class="policy-detail__effective">
              <UiFolio :value="String(selectedPolicy.effective_at ?? '—')" variant="timestamp" />
            </span>
          </div>
          <p class="policy-detail__actor">
            {{ t('policy.label_actor') }}:
            <UiFolio :value="String(selectedPolicy.actor_subject_id ?? '—')" variant="id" />
          </p>
          <p v-if="selectedPolicy.reason" class="policy-detail__reason">
            {{ selectedPolicy.reason }}
          </p>
          <h3 class="policy-detail__h3">{{ t('policy.payload_label') }}</h3>
          <pre class="policy-json">{{ selectedJson }}</pre>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.policy {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.policy__hero {
  display: grid;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.policy__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.policy__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.policy__summary,
.policy__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.policy__h2 {
  margin: 0 0 12px;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.policy__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.policy__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.policy__muted {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-3);
}
.policy-json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  white-space: pre;
}
.policy-detail {
  display: grid;
  gap: 12px;
}
.policy-detail__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.policy-detail__actor,
.policy-detail__reason {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.policy-detail__h3 {
  margin: 4px 0 0;
  font: 600 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
}
</style>
