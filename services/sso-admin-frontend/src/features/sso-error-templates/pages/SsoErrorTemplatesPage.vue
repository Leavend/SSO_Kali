<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useSessionStore } from '@/stores/session.store'
import { useSsoErrorTemplatesStore } from '../stores/sso-error-templates.store'
import type { SsoErrorTemplate, UpsertSsoErrorTemplatePayload } from '../types'

const store = useSsoErrorTemplatesStore()
const session = useSessionStore()
const { t } = useI18n()
const canWriteSsoErrorTemplates = computed(() =>
  session.hasPermission('admin.sso-error-templates.write'),
)
const errorCodes = [
  'invalid_request',
  'invalid_grant',
  'access_denied',
  'login_required',
  'interaction_required',
  'temporarily_unavailable',
  'network_error',
  'server_error',
  'configuration_error',
  'session_expired',
  'csrf_failed',
]

const editingCode = ref<string | null>(null)
const defaultDraft = (): UpsertSsoErrorTemplatePayload => ({
  locale: 'id',
  title: '',
  message: '',
  action_label: '',
  action_url: null,
  retry_allowed: false,
  alternative_login_allowed: false,
  is_enabled: false,
})
const draft = ref<UpsertSsoErrorTemplatePayload>(defaultDraft())

const hasEvidence = computed(() => store.templates.length > 0)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})

function startEdit(template: SsoErrorTemplate): void {
  editingCode.value = template.error_code
  draft.value = {
    locale: template.locale as 'id' | 'en',
    title: template.title,
    message: template.message,
    action_label: template.action_label,
    action_url: template.action_url,
    retry_allowed: template.retry_allowed,
    alternative_login_allowed: template.alternative_login_allowed,
    is_enabled: template.is_enabled,
  }
}

function cancelEdit(): void {
  editingCode.value = null
  draft.value = defaultDraft()
}

async function saveTemplate(errorCode: string): Promise<void> {
  const locale = draft.value.locale ?? 'id'
  await store.upsert(errorCode, {
    locale,
    title: draft.value.title ?? '',
    message: draft.value.message ?? '',
    action_label: draft.value.action_label ?? '',
    action_url: draft.value.action_url ?? null,
    retry_allowed: draft.value.retry_allowed ?? false,
    alternative_login_allowed: draft.value.alternative_login_allowed ?? false,
    is_enabled: draft.value.is_enabled ?? false,
  })
  editingCode.value = null
  draft.value = defaultDraft()
}

async function handleReset(errorCode: string, locale?: string): Promise<void> {
  await store.resetTemplate(errorCode, locale ?? 'id')
}

function templateFor(code: string): SsoErrorTemplate | undefined {
  return store.templates.find((t) => t.error_code === code && t.locale === 'id')
}
</script>

<template>
  <section
    class="policy-page max-w-page mx-auto px-4 md:px-6 py-8"
    aria-labelledby="sso-templates-title"
  >
    <div class="page-heading">
      <p class="eyebrow">{{ t('sso_templates.eyebrow') }}</p>
      <h1 id="sso-templates-title">{{ t('sso_templates.title') }}</h1>
      <p class="page-summary">{{ t('sso_templates.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('sso_templates.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Security Governance"
      :title="t('sso_templates.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('sso_templates.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasEvidence"
      :title="t('sso_templates.empty_title')"
      :description="t('sso_templates.empty_desc')"
    />

    <div v-else class="policy-layout">
      <section class="detail-section" aria-label="SSO error template catalog">
        <div v-for="code in errorCodes" :key="code" class="ui-card">
          <template v-if="editingCode === code">
            <div class="edit-form">
              <UiFormField :id="`template-title-${code}`" label="Title">
                <UiInput :id="`template-title-${code}`" v-model="draft.title" autocomplete="off" />
              </UiFormField>
              <UiFormField :id="`template-message-${code}`" label="Message">
                <UiTextarea :id="`template-message-${code}`" v-model="draft.message" :rows="3" />
              </UiFormField>
              <UiFormField :id="`template-action-label-${code}`" label="Action label">
                <UiInput
                  :id="`template-action-label-${code}`"
                  v-model="draft.action_label"
                  autocomplete="off"
                />
              </UiFormField>
              <UiFormField :id="`template-action-url-${code}`" label="Action URL">
                <input
                  :id="`template-action-url-${code}`"
                  v-model="draft.action_url"
                  class="ui-control"
                  autocomplete="off"
                />
              </UiFormField>
              <div class="checkbox-row">
                <UiSwitch v-model="draft.retry_allowed" label="Retry allowed" />
                <UiSwitch v-model="draft.alternative_login_allowed" label="Alternative login" />
                <UiSwitch v-model="draft.is_enabled" label="Enabled" />
              </div>
              <div class="action-row compact-actions">
                <button
                  v-if="canWriteSsoErrorTemplates"
                  class="ui-action ui-action--primary"
                  type="button"
                  @click="saveTemplate(code)"
                >
                  Save
                </button>
                <button class="ui-action ui-action--secondary" type="button" @click="cancelEdit()">
                  Cancel
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="template-header">
              <strong>{{ code }}</strong>
              <span v-if="templateFor(code)?.is_enabled" class="status-badge status-badge--enabled"
                >enabled</span
              >
              <span v-else class="status-badge status-badge--default">default</span>
            </div>
            <p v-if="templateFor(code)">
              <strong>{{ templateFor(code)!.title }}</strong> &mdash;
              {{ templateFor(code)!.message }}
            </p>
            <p v-if="templateFor(code)">
              Action: {{ templateFor(code)!.action_label }}
              <span v-if="templateFor(code)!.action_url"
                >({{ templateFor(code)!.action_url }})</span
              >
            </p>
            <p v-else class="muted">Default catalog entry (belum di-customize).</p>
            <div v-if="canWriteSsoErrorTemplates" class="action-row compact-actions">
              <button
                class="ui-action ui-action--primary"
                type="button"
                @click="
                  startEdit(
                    templateFor(code) ?? {
                      error_code: code,
                      locale: 'id',
                      title: '',
                      message: '',
                      action_label: '',
                      action_url: null,
                      retry_allowed: false,
                      alternative_login_allowed: false,
                      is_enabled: false,
                    },
                  )
                "
              >
                Edit
              </button>
              <button class="ui-action ui-action--danger" type="button" @click="handleReset(code)">
                Reset
              </button>
            </div>
          </template>
        </div>
        <p
          v-if="store.actionStatus === 'error' || store.actionStatus === 'step_up_required'"
          class="ui-action-message"
          role="alert"
        >
          {{ store.errorMessage }}
        </p>
      </section>
    </div>

    <EvidenceContextPanel title="SSO error template evidence" :request-id="store.requestId" />
  </section>
</template>

<style scoped>
.template-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.status-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
}

.status-badge--enabled {
  color: #ccfbf1;
  background: rgb(20 184 166 / 14%);
}

.status-badge--default {
  color: #e0e7ff;
  background: rgb(99 102 241 / 14%);
}

.checkbox-row {
  display: flex;
  gap: 1rem;
  margin-block: 0.5rem;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
