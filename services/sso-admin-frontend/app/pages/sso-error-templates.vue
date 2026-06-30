<!-- app/pages/sso-error-templates.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useSsoErrorTemplates } from '@/composables/useSsoErrorTemplates'
import {
  resolveEnabledTone,
  templateKey,
} from '@/lib/sso-error-templates/sso-error-templates-view-state'
import SsoErrorTemplatesTable from '@/components/sso-error-templates/SsoErrorTemplatesTable.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import type { SsoErrorTemplate } from '@/types/sso-error-templates.types'

definePageMeta({
  name: 'admin.sso-error-templates',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.security-policy.read'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-sso-error-templates-principal', () => store.ensureSession())

const { templates, viewState, requestId, isStale, refresh } = useSsoErrorTemplates()

const templateList = computed<readonly SsoErrorTemplate[]>(() => templates.value ?? [])

const canWrite = computed<boolean>(() => store.hasPermission('admin.sso-error-templates.write'))

const localeLabels = computed<Readonly<Record<string, string>>>(() => ({
  id: t('sso_templates.locale_id'),
  en: t('sso_templates.locale_en'),
}))

const selectedKey = ref<string | null>(null)
const selectedTemplate = computed<SsoErrorTemplate | null>(
  () => templateList.value.find((tpl) => templateKey(tpl) === selectedKey.value) ?? null,
)

const successMessage = ref<string | null>(null)

function onSelect(key: string): void {
  selectedKey.value = key
}
function onCloseDrawer(): void {
  selectedKey.value = null
}
async function onRefresh(): Promise<void> {
  await refresh()
}
function yesNo(value: boolean): string {
  return value ? t('sso_templates.ov_yes') : t('sso_templates.ov_no')
}
</script>

<template>
  <section class="sso-templates" data-page="sso-error-templates" data-admin-shell>
    <header class="sso-templates__hero">
      <span class="sso-templates__eyebrow">{{ t('sso_templates.eyebrow') }}</span>
      <div class="sso-templates__heading">
        <div>
          <h1 class="sso-templates__title">{{ t('sso_templates.title') }}</h1>
          <p class="sso-templates__summary">{{ t('sso_templates.summary') }}</p>
          <p class="sso-templates__principal" data-principal-name>
            {{ t('sso_templates.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
      </div>
    </header>

    <p
      v-if="successMessage"
      class="sso-templates__success"
      role="status"
      aria-live="polite"
      data-testid="sso-templates-action-success"
    >
      {{ successMessage }}
    </p>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('sso_templates.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('sso_templates.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('sso_templates.eyebrow')"
      :title="t('sso_templates.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          size="sm"
          data-testid="sso-templates-refresh"
          @click="onRefresh"
        >
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('sso_templates.empty_title')"
      :description="t('sso_templates.empty_desc')"
    />

    <template v-else>
      <div v-if="isStale" class="sso-templates__banner" role="status">
        {{ t('common.error_loading_desc') }}
      </div>

      <SsoErrorTemplatesTable
        :templates="templateList"
        :caption="t('sso_templates.list_caption')"
        :code-label="t('sso_templates.col_error_code')"
        :locale-label="t('sso_templates.col_locale')"
        :title-label="t('sso_templates.col_title')"
        :status-label="t('sso_templates.col_status')"
        :enabled-text="t('sso_templates.status_enabled')"
        :disabled-text="t('sso_templates.status_disabled')"
        @select="onSelect"
      />

      <UiDetailDrawer
        v-if="selectedTemplate"
        :open="selectedTemplate !== null"
        title-id="sso-template-detail-drawer"
        :title="selectedTemplate.title"
        :description="`${selectedTemplate.error_code} · ${localeLabels[selectedTemplate.locale] ?? selectedTemplate.locale}`"
        :close-label="t('common.close')"
        @close="onCloseDrawer"
      >
        <div class="sso-detail" data-testid="sso-template-detail">
          <div class="sso-detail__head">
            <UiStatusBadge
              :tone="resolveEnabledTone(selectedTemplate.is_enabled)"
              :label="
                selectedTemplate.is_enabled
                  ? t('sso_templates.status_enabled')
                  : t('sso_templates.status_disabled')
              "
            />
          </div>
          <dl class="sso-detail__grid">
            <div class="sso-detail__wide">
              <dt>{{ t('sso_templates.ov_message') }}</dt>
              <dd>{{ selectedTemplate.message }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_action_label') }}</dt>
              <dd>{{ selectedTemplate.action_label }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_action_url') }}</dt>
              <dd>{{ selectedTemplate.action_url ?? t('sso_templates.none') }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_retry') }}</dt>
              <dd>{{ yesNo(selectedTemplate.retry_allowed) }}</dd>
            </div>
            <div>
              <dt>{{ t('sso_templates.ov_alternative_login') }}</dt>
              <dd>{{ yesNo(selectedTemplate.alternative_login_allowed) }}</dd>
            </div>
          </dl>
        </div>
      </UiDetailDrawer>
    </template>
  </section>
</template>

<style scoped>
.sso-templates {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.sso-templates__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.sso-templates__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.sso-templates__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sso-templates__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.sso-templates__summary,
.sso-templates__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.sso-templates__success {
  margin: 0;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border);
}
.sso-templates__banner {
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
}
.sso-detail {
  display: grid;
  gap: 16px;
}
.sso-detail__head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sso-detail__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin: 0;
}
.sso-detail__wide {
  grid-column: 1 / -1;
}
.sso-detail__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.sso-detail__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
