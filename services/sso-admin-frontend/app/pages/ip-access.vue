<!-- app/pages/ip-access.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useIpAccessRules } from '@/composables/useIpAccessRules'
import { resolveModeTone } from '@/lib/ip-access/ip-access-view-state'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import IpAccessRulesTable from '@/components/ip-access/IpAccessRulesTable.vue'
import type { IpAccessRule } from '@/types/ip-access.types'

definePageMeta({
  name: 'admin.ip-access',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.ip-access.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-ip-access-principal', () => store.ensureSession())

const { rules, viewState, requestId, isStale, refresh } = useIpAccessRules()

const ruleList = computed<readonly IpAccessRule[]>(() => rules.value ?? [])

const canWrite = computed<boolean>(() => store.hasPermission('admin.ip-access.write'))
// Delete is double-gated: write + sessions.terminate (the backend also requires
// the session-management role, enforced server-side and invisible to the UI).
const canDelete = computed<boolean>(
  () => canWrite.value && store.hasPermission('admin.sessions.terminate'),
)

const selectedId = ref<number | null>(null)
const selectedRule = computed<IpAccessRule | null>(
  () => ruleList.value.find((r) => r.id === selectedId.value) ?? null,
)

const successMessage = ref<string | null>(null)

const modeLabels = computed<Readonly<Record<string, string>>>(() => ({
  allow: t('ip_access.mode_allow'),
  block: t('ip_access.mode_block'),
}))

function onSelectRule(id: number): void {
  selectedId.value = id
}
function onCloseDrawer(): void {
  selectedId.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}

// Write handlers — declared as stubs here so the template binds a stable symbol;
// bodies are implemented in Task 11.8 (create) and Task 11.9 (delete).
function onCreateRequested(): void {
  // ponytail: stub filled in Task 11.8
}
function onDeleteRequested(_rule: IpAccessRule): void {
  // ponytail: stub filled in Task 11.9
}
</script>

<template>
  <section class="ip-access" data-page="ip-access" data-admin-shell>
    <header class="ip-access__hero">
      <span class="ip-access__eyebrow">{{ t('ip_access.eyebrow') }}</span>
      <div class="ip-access__heading">
        <div>
          <h1 class="ip-access__title">{{ t('ip_access.title') }}</h1>
          <p class="ip-access__summary">{{ t('ip_access.summary') }}</p>
          <p class="ip-access__principal" data-principal-name>
            {{ t('ip_access.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <UiButton
          v-if="canWrite"
          variant="primary"
          size="sm"
          data-testid="ip-access-create"
          @click="onCreateRequested"
        >
          {{ t('ip_access.btn_add_rule') }}
        </UiButton>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="ip-access__success"
      role="status"
      aria-live="polite"
      data-testid="ip-access-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('ip_access.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('ip_access.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('ip_access.eyebrow')"
      :title="t('ip_access.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="ip-access-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('ip_access.empty_title')"
      :description="t('ip_access.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="ip-access__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <IpAccessRulesTable
        :rules="ruleList"
        :caption="t('ip_access.list_caption')"
        :cidr-label="t('ip_access.col_cidr')"
        :mode-label="t('ip_access.col_mode')"
        :reason-label="t('ip_access.col_reason')"
        :created-label="t('ip_access.col_created')"
        :allow-text="t('ip_access.mode_allow')"
        :block-text="t('ip_access.mode_block')"
        @select="onSelectRule"
      />

      <UiDetailDrawer
        v-if="selectedRule"
        :open="selectedRule !== null"
        title-id="ip-access-detail-drawer"
        :title="selectedRule.cidr"
        :description="modeLabels[selectedRule.mode] ?? selectedRule.mode"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="ip-detail" data-testid="ip-access-detail">
          <div class="ip-detail__head">
            <UiStatusBadge
              :tone="resolveModeTone(selectedRule.mode)"
              :label="modeLabels[selectedRule.mode] ?? selectedRule.mode"
            />
          </div>
          <dl class="ip-detail__grid">
            <div class="ip-detail__wide">
              <dt>{{ t('ip_access.ov_reason') }}</dt>
              <dd>{{ selectedRule.reason ?? '—' }}</dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_expires') }}</dt>
              <dd>
                <UiFolio
                  v-if="selectedRule.expires_at"
                  :value="selectedRule.expires_at"
                  variant="timestamp"
                />
                <span v-else>{{ t('ip_access.never') }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_actor') }}</dt>
              <dd><UiFolio :value="selectedRule.actor_subject_id ?? '—'" variant="id" /></dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_created') }}</dt>
              <dd><UiFolio :value="selectedRule.created_at ?? '—'" variant="timestamp" /></dd>
            </div>
            <div>
              <dt>{{ t('ip_access.ov_updated') }}</dt>
              <dd><UiFolio :value="selectedRule.updated_at ?? '—'" variant="timestamp" /></dd>
            </div>
          </dl>

          <div v-if="canDelete" class="ip-detail__actions">
            <UiButton
              variant="danger"
              size="sm"
              data-testid="ip-access-delete"
              @click="onDeleteRequested(selectedRule)"
            >
              {{ t('common.btn_delete') }}
            </UiButton>
          </div>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.ip-access {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.ip-access__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.ip-access__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.ip-access__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ip-access__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ip-access__summary,
.ip-access__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ip-access__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.ip-access__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.ip-detail {
  display: grid;
  gap: 16px;
}
.ip-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ip-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.ip-detail__wide {
  grid-column: 1 / -1;
}
.ip-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ip-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
.ip-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
</style>
